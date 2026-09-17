import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { buildDailyGroupAttendance, filterDailyAttendance, inAttendanceRange, attendancePresetRange } = loadTsModule("../src/lib/attendance-trend.ts");
const events = [
  { id: "w", title: "주일 예배", eventDate: "2026-09-13" },
  { id: "duplicate", title: "주일 예배", eventDate: "2026-09-13" },
  { id: "m", title: "순모임", eventDate: "2026-09-13" },
  { id: "next", title: "주일 예배", eventDate: "2026-09-20" },
];
const member = (groupId, ids) => ({ groupId, attendanceHistory: ids.map((eventId) => ({ eventId, status: "present" })) });

test("daily chart counts both events once, deduplicates events and preserves missing vs zero", () => {
  const rows = buildDailyGroupAttendance([member("a", ["w", "duplicate", "m"]), member("b", ["m"]), member(null, ["w"])], events);
  const points = filterDailyAttendance(rows, { start: "", end: "" }, "all");
  assert.equal(points.length, 2);
  assert.equal(points[0].combined, 3);
  assert.equal(points[0].worship, 2);
  assert.equal(points[0].meeting, 2);
  assert.equal(points[1].worship, 0);
  assert.equal(points[1].meeting, null);
  assert.equal(filterDailyAttendance(rows, { start: "", end: "" }, "a")[0].combined, 1);
  assert.equal(filterDailyAttendance(rows, { start: "", end: "" }, "unassigned")[0].combined, 1);
  assert.equal(JSON.stringify(rows).includes("attendanceHistory"), false);
  assert.equal(JSON.stringify(rows).includes("eventId"), false);
});

test("ranges include endpoints, support open bounds and return empty for inverted periods", () => {
  const rows = buildDailyGroupAttendance([member("a", ["w"])], events);
  assert.equal(filterDailyAttendance(rows, { start: "2026-09-13", end: "2026-09-13" }, "all").length, 1);
  assert.equal(filterDailyAttendance(rows, { start: "2026-09-14", end: "" }, "all").length, 1);
  assert.equal(inAttendanceRange("2026-09-13", { start: "2026-09-20", end: "2026-09-01" }), false);
  assert.equal(filterDailyAttendance(rows, { start: "2027-01-01", end: "" }, "all").length, 0);
  assert.equal(attendancePresetRange(4, "2026-09-20").start, "2026-08-24");
  assert.equal(attendancePresetRange(0, "2026-09-20").end, "");
});

test("long periods retain every date and absent/excused members do not count", () => {
  const dates = Array.from({ length: 70 }, (_, i) => { const date = new Date("2026-01-01T12:00:00Z"); date.setUTCDate(date.getUTCDate() + i); return { id: `e${i}`, title: "주일 예배", eventDate: date.toISOString().slice(0, 10) }; });
  const rows = buildDailyGroupAttendance([{ groupId: "a", attendanceHistory: [{ eventId: "e0", status: "excused" }] }], dates);
  const points = filterDailyAttendance(rows, { start: "", end: "" }, "all");
  assert.equal(points.length, 70);
  assert.equal(points[0].combined, 0);
  assert.equal(points.at(-1).date, dates.at(-1).eventDate);
});

test("chart uses server aggregate for restricted roles without expanding raw visibility", () => {
  const loader = readFileSync(new URL("../src/lib/app-page-data.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  assert.match(loader, /dailyGroupTrend: buildDailyGroupAttendance\(attendanceMembers, attendanceEvents\)/);
  assert.match(loader, /\.filter\(isAttendanceRosterMember\)/);
  assert.match(ui, /attendanceStats\?\.dailyGroupTrend \?\? buildDailyGroupAttendance/);
  assert.doesNotMatch(ui, /filteredTrendRows|statsDateFilter/);
});

test("attendance detail defaults to the latest four weeks while keeping range controls", () => {
  const ui = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  assert.match(ui, /useState<AttendanceRange>\(\(\) => attendancePresetRange\(\s*4,/);
  assert.match(ui, /const \[statsPeriod, setStatsPeriod\] = useState\("4"\)/);
  assert.match(ui, /attendanceEvents.map\(\(event\) => event.eventDate\).sort\(\).at\(-1\) \?\? attendanceDate/);
  const range = attendancePresetRange(4, "2026-09-20");
  for (const date of ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20"]) assert.equal(inAttendanceRange(date, range), true);
  assert.equal(inAttendanceRange("2026-08-23", range), false);
  assert.match(ui, /<option value="all">전체 기간<\/option>/);
});
