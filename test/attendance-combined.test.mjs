import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

const actions = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const source = actions.slice(actions.indexOf("export async function toggleBothAttendance("), actions.indexOf("export async function toggleAttendance("));
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const memberId = "33333333-3333-4333-8333-333333333333";

function setup({ before = [], denied = false, failWrite = false, dates = ["2026-09-13", "2026-09-13"] } = {}) {
  const writes = [], audits = [];
  let permission, checkedMember, refreshed = false;
  const events = ids.map((id, index) => ({ id, title: index ? "순모임" : "주일 예배", event_date: dates[index] }));
  const supabase = { from(table) {
    let payload;
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      upsert(rows) { payload = rows; writes.push(rows); return query; },
      then(resolve) { return Promise.resolve({ data: payload ? payload.map((row, index) => ({ ...row, id: ids[index] })) : table === "attendance_events" ? events : before,
        error: payload && failWrite ? new Error("write rejected") : null }).then(resolve); },
    };
    return query;
  }};
  const context = vm.createContext({ exports: {}, z,
    getAuthorizedCurrentMember: async (value) => { permission = value; return { supabase, currentMember: { id: "actor", role: "staff" } }; },
    assertCanManageAttendanceForMember: async ({ targetMemberId }) => { checkedMember = targetMemberId; if (denied) throw new Error("outside own group"); },
    writeAuditLog: async (record) => audits.push(record),
    revalidateAppData: () => { refreshed = true; },
  });
  vm.runInContext(code, context);
  return { run: (present, eventIds = ids) => context.exports.toggleBothAttendance(memberId, eventIds, present), writes, audits,
    state: () => ({ permission, checkedMember, refreshed }) };
}

test("combined attendance writes both events once and checks member scope", async () => {
  const app = setup(); await app.run(true);
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].length, 2);
  assert.ok(app.writes[0].every((row) => row.status === "present" && row.member_id === memberId));
  assert.equal(app.audits.length, 2);
  assert.deepEqual(app.state(), { permission: "attendance:write", checkedMember: memberId, refreshed: true });
});

test("combined uncheck preserves reasons separately for each event", async () => {
  const app = setup({ before: [{ event_id: ids[0], note: "travel", excuse_start_date: "2026-09-13" }] });
  await app.run(false);
  assert.equal(app.writes[0][0].status, "excused");
  assert.equal(app.writes[0][0].note, "travel");
  assert.equal(app.writes[0][1].status, "absent");
});

test("out-of-group request cannot write either record", async () => {
  const app = setup({ denied: true }); await assert.rejects(app.run(true), /outside own group/);
  assert.equal(app.writes.length, 0);
});

test("different dates and duplicate event IDs are rejected before writing", async () => {
  const app = setup({ dates: ["2026-09-13", "2026-09-20"] });
  await assert.rejects(app.run(true)); assert.equal(app.writes.length, 0);
  await assert.rejects(setup().run(true, [ids[0], ids[0]]));
});

test("failed combined write does not report successful audit or refresh", async () => {
  const app = setup({ failWrite: true }); await assert.rejects(app.run(true), /write rejected/);
  assert.equal(app.audits.length, 0); assert.equal(app.state().refreshed, false);
});

test("roster refresh reloads current server data without deleting attendance", () => {
  const ui = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  assert.match(ui, /startRosterRefresh\(\(\) => router.refresh\(\)\)/);
  const controls = ui.slice(ui.indexOf('<div className="attendance-check-controls">'), ui.indexOf('<div className="attendance-group-strip"'));
  assert.ok(controls.indexOf('className="segmented"') < controls.indexOf('attendance-roster-refresh'));
  assert.ok(controls.includes('attendance-roster-refresh'));
  assert.match(ui, /setLocalMembers\(members\);\s*\}, \[attendanceEventId, members\]\)/);
  const data = readFileSync(new URL("../src/lib/supabase/data.ts", import.meta.url), "utf8");
  assert.match(data, /group_id, groups!members_group_id_fkey\(name\), attendance_records!/);
});
