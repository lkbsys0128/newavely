import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { loadTsModule } from "./load-ts-module.mjs";

const { roles, hasPermission } = loadTsModule("../src/lib/rbac.ts");
const { assertRegisteredMember } = loadTsModule("../src/lib/registration-access.ts");
const source = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const action = source.slice(source.indexOf("export async function toggleLeaderExtraAttendance("), source.indexOf("export async function deactivateMember("));
const compiled = ts.transpileModule(action.replace("export async", "async"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ role = "welcome", status = "active", title = "주일 예배", leaderRole = "elder", targetError = null, writeError = null } = {}) {
  const writes = [];
  const audits = [];
  let privilegedCalls = 0;
  const session = { from() { throw new Error("Private roster access through viewer RLS"); } };
  const client = {
    from(table) {
      let payload;
      const result = () => table === "attendance_events"
        ? { data: { title }, error: null }
        : table === "members"
          ? { data: { custom_fields: { community_leader_role: leaderRole }, groups: null }, error: targetError }
          : { data: payload ? { id: "record", ...payload } : { note: "existing reason" }, error: payload ? writeError : null };
      const query = {
        select() { return query; }, eq() { return query; }, neq() { return query; },
        single: async () => result(), maybeSingle: async () => result(),
        upsert(value) { payload = value; writes.push(value); return query; },
      };
      return query;
    },
  };
  const context = vm.createContext({
    getAuthorizedCurrentMember: async (permission) => {
      assertRegisteredMember({ status });
      if (!hasPermission(role, permission)) throw new Error("Forbidden");
      return { supabase: session, currentMember: { id: "actor", role } };
    },
    leaderExtraAttendanceSchema: { parse: (value) => value },
    createServiceRoleClient: () => { privilegedCalls++; return client; },
    getCommunityLeaderRoleValue: (fields) => ["clergy", "team_leader", "elder", "deaconess"].includes(fields.community_leader_role) ? fields.community_leader_role : null,
    communityLeaderGroupName: "공동체 리더",
    writeAuditLog: async (entry) => { assert.equal(entry.supabase, session); audits.push(entry); },
    revalidateAppData() {},
  });
  vm.runInContext(compiled, context);
  return { run: (present = true) => context.toggleLeaderExtraAttendance("target", "event", present), writes, audits, privilegedCalls: () => privilegedCalls };
}

for (const role of roles) {
  test(`extra leader attendance role boundary: ${role}`, async () => {
    const state = setup({ role });
    if (["owner", "admin", "welcome"].includes(role)) {
      await state.run();
      assert.equal(state.writes[0].status, "present");
      assert.equal(state.writes[0].checked_by_member_id, "actor");
      assert.equal(state.audits.length, 1);
    } else {
      await assert.rejects(state.run(), /Forbidden/);
      assert.equal(state.privilegedCalls(), 0);
    }
  });
}

for (const status of ["new", "inactive"]) {
  test(`unregistered ${status} welcome cannot access privileged client`, async () => {
    const state = setup({ status });
    await assert.rejects(state.run(), /승인/);
    assert.equal(state.privilegedCalls(), 0);
  });
}

test("welcome can mark each leader category absent while retaining reason and actor", async () => {
  for (const leaderRole of ["clergy", "team_leader", "elder", "deaconess"]) {
    const state = setup({ leaderRole, status: "care" });
    await state.run(false);
    assert.equal(state.writes[0].status, "absent");
    assert.equal(state.writes[0].note, "existing reason");
  }
});

test("welcome cannot mutate small-group events or ordinary members", async () => {
  for (const options of [{ title: "순모임" }, { leaderRole: null }, { targetError: new Error("not found") }]) {
    const state = setup(options);
    await assert.rejects(state.run());
    assert.equal(state.writes.length, 0);
    assert.equal(state.audits.length, 0);
  }
});

test("failed attendance write is not recorded as a successful audit", async () => {
  const state = setup({ writeError: new Error("write failed") });
  await assert.rejects(state.run(), /write failed/);
  assert.equal(state.audits.length, 0);
});
