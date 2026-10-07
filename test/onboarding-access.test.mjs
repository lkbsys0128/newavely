import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { isRegisteredMember, assertRegisteredMember } = loadTsModule("../src/lib/registration-access.ts");
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("pending accounts are rejected independent of their role", () => {
  for (const role of ["owner", "admin", "leader", "staff", "assistant", "welcome", "member"]) {
    for (const status of ["new", "inactive", "unknown"]) {
      assert.equal(isRegisteredMember({ role, status }), false);
      assert.throws(() => assertRegisteredMember({ role, status }));
    }
    for (const status of ["active", "care"]) assert.doesNotThrow(() => assertRegisteredMember({ role, status }));
  }
});

test("onboarding returns before any roster, event initialization, or public stats query", () => {
  const source = read("../src/lib/app-page-data.ts");
  const loader = source.slice(source.indexOf("export async function getAppPageData"));
  const gate = loader.indexOf("if (currentMember.needsOnboarding)");
  assert.ok(gate > 0);
  for (const call of ["await ensureAttendanceEvent", "getDashboardData(supabase", "getPublicDashboardData(supabase"]) assert.ok(gate < loader.indexOf(call));
  assert.match(loader.slice(gate, loader.indexOf("await ensureAttendanceEvent")), /members: \[\]/);
});

test("only link requests opt into pending access; standalone writes also check registration", () => {
  const source = read("../src/app/actions.ts");
  assert.equal((source.match(/getAuthorizedCurrentMember\("members:read", true\)/g) ?? []).length, 1);
  assert.match(source, /if \(!allowOnboarding\) assertRegisteredMember\(currentMember\)/);
  for (const action of ["updateMyStatusMessage", "createAdminFeedbackMessage"]) {
    const body = source.split(`export async function ${action}`)[1].split("export async function")[0];
    assert.match(body, /assertRegisteredMember\(currentMember\)/);
  }
});
