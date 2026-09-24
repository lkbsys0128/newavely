import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { restoreAttendanceEvents } = loadTsModule("../src/lib/attendance-optimistic.ts");
const record = (eventId, status) => ({ eventId, status });

test("a failed write rolls back only its own event and leaves another member's success intact", () => {
  const before = { id: "a", present: false, attendanceHistory: [record("w", "absent"), record("g", "absent")] };
  const other = { id: "b", present: true, attendanceHistory: [record("w", "present")] };
  const current = [{ ...before, name: "new profile", present: true, attendanceHistory: [record("w", "present"), record("g", "present")] }, other];
  const result = restoreAttendanceEvents(current, before, ["w"], "w");
  assert.equal(result[1], other);
  assert.equal(result[0].name, "new profile");
  assert.equal(result[0].present, false);
  assert.equal(result[0].attendanceHistory.find(r => r.eventId === "g").status, "present");
  assert.equal(current[0].present, true);
});

test("combined failure restores both events and removes optimistic records that did not exist", () => {
  const before = { id: "a", present: false, attendanceHistory: [record("old", "present")] };
  const result = restoreAttendanceEvents([{ ...before, attendanceHistory: [record("w", "present"), record("g", "present"), ...before.attendanceHistory] }], before, ["w", "g"], "old");
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].attendanceHistory)), before.attendanceHistory);
});

test("different member completions can be reconciled in either order without cross-member rollback", () => {
  const a = { id: "a", present: false, attendanceHistory: [record("w", "absent")] };
  const b = { id: "b", present: false, attendanceHistory: [record("w", "excused")] };
  const changed = [a, b].map(m => ({ ...m, present: true, attendanceHistory: [record("w", "present")] }));
  assert.deepEqual(
    restoreAttendanceEvents(restoreAttendanceEvents(changed, a, ["w"], "w"), b, ["w"], "w"),
    restoreAttendanceEvents(restoreAttendanceEvents(changed, b, ["w"], "w"), a, ["w"], "w"),
  );
});

test("UI locks a member synchronously and rebases optimistic changes on refreshed server props", () => {
  const ui = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  assert.match(ui, /useOptimistic\(members\)/);
  assert.match(ui, /attendanceLocks\.current\.has\(member.id\)/);
  assert.match(ui, /attendanceLocks\.current\.add\(member.id\)/);
  assert.match(ui, /pendingAttendanceMembers\.has\(member.id\)/);
  assert.doesNotMatch(ui, /setLocalMembers\(members\)/);
  const both = ui.slice(ui.indexOf("const handleToggleBothAttendance"), ui.indexOf("const attendanceOverviewStats"));
  assert.match(both, /saveAttendance/);
  assert.doesNotMatch(both, /router.refresh/);
});
