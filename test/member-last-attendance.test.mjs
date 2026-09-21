import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { getLastAttendanceDate } = loadTsModule("../src/lib/member-last-attendance.ts");
const today = new Date("2026-09-21T12:00:00Z");
const record = (eventDate, status = "present", title = "주일 예배") => ({ eventDate, status, title });

test("last attendance uses latest present date across worship and group meetings", () => {
  const history = [record("2026-09-06"), record("2026-09-20", "absent"), record("2026-09-13", "present", "순모임"), record("2026-09-21", "excused")];
  assert.equal(getLastAttendanceDate(history, today), "2026-09-13");
  assert.equal(getLastAttendanceDate([...history, record("2026-09-13")], today), "2026-09-13");
  assert.equal(history[0].eventDate, "2026-09-06");
});

test("missing, invalid and future attendance do not become the last attendance", () => {
  assert.equal(getLastAttendanceDate([], today), "");
  assert.equal(getLastAttendanceDate([record("2026-09-20", "absent"), record(""), record("2026-02-30"), record("2026-09-22"), record("invalid")], today), "");
  assert.equal(getLastAttendanceDate([record("2026-09-21")], new Date("2026-09-21T06:00:00Z")), "");
});

test("both member detail views include summary and masked history stays private", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(read("../src/components/member-detail.tsx"), /<MemberLastAttendance member=\{member\}/);
  assert.match(read("../src/components/dashboard.tsx"), /<MemberLastAttendance member=\{selectedMember\}/);
  assert.match(read("../src/lib/member-visibility.ts"), /attendanceHistoryHidden: true/);
  assert.match(read("../src/components/member-last-attendance.tsx"), /member.attendanceHistoryHidden \? "비공개"/);
});
