import type { AttendanceRecordSummary } from "./types";

export function getLastAttendanceDate(records: AttendanceRecordSummary[], today = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(today);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const todayKey = `${values.year}-${values.month}-${values.day}`;
  let latest = "";
  for (const record of records) {
    const date = record.eventDate;
    if (record.status !== "present" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey) continue;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
    if (date > latest) latest = date;
  }
  return latest;
}
