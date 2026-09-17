import type { AttendanceEvent, AttendanceExtraCount, Member } from "./types";
import { isAttendanceRosterMember } from "./member-filters";

export type AttendanceRange = { start: string; end: string };
export type DailyAttendancePoint = { date: string; combined: number; worship: number | null; meeting: number | null };
export type DailyGroupAttendancePoint = DailyAttendancePoint & { groupId: string };
export type DailyAttendanceTotal = { date: string; youth: number; total: number; clergy: number; teamLeaders: number; visitors: number; newFamily: number };

export function buildDailyAttendanceTotals(youthMembers: Member[], allMembers: Member[], events: AttendanceEvent[], extras: AttendanceExtraCount[]): DailyAttendanceTotal[] {
  const dates = [...new Set(events.filter((event) => event.title === "주일 예배" || event.title === "순모임").map((event) => event.eventDate))].sort();
  const eligibleYouth = youthMembers.filter(isAttendanceRosterMember);
  const leaders = allMembers.filter(isAttendanceRosterMember).filter((member) => ["clergy", "team_leader", "elder", "deaconess"].includes(String(member.customFields.community_leader_role)));
  const extraByDate = new Map(extras.map((row) => [row.eventDate, row]));
  const presentIds = (members: Member[], ids: Set<string>) => new Set(members.filter((member) => member.attendanceHistory.some((record) => ids.has(record.eventId) && record.status === "present")).map((member) => member.id));
  return dates.map((date) => {
    const dayEvents = events.filter((event) => event.eventDate === date && (event.title === "주일 예배" || event.title === "순모임"));
    const worshipIds = new Set(dayEvents.filter((event) => event.title === "주일 예배").map((event) => event.id));
    const youth = presentIds(eligibleYouth, new Set(dayEvents.map((event) => event.id)));
    const leaderIds = presentIds(leaders, worshipIds);
    const clergy = leaders.filter((member) => member.customFields.community_leader_role === "clergy" && leaderIds.has(member.id)).length;
    const teamLeaders = leaderIds.size - clergy;
    const extra = extraByDate.get(date);
    const visitors = worshipIds.size ? extra?.visitorCount ?? 0 : 0;
    const newFamily = worshipIds.size ? extra?.newFamilyCount ?? 0 : 0;
    return { date, youth: youth.size, total: new Set([...youth, ...leaderIds]).size + visitors + newFamily, clergy, teamLeaders, visitors, newFamily };
  });
}

export function inAttendanceRange(date: string, range: AttendanceRange): boolean {
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

export function attendancePresetRange(weeks: number, end: string): AttendanceRange {
  if (!weeks || !end) return { start: "", end: "" };
  const date = new Date(`${end}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - weeks * 7 + 1);
  return { start: date.toISOString().slice(0, 10), end };
}

// Only count payloads leave the server; a person attending both events counts once.
export function buildDailyGroupAttendance(members: Member[], events: AttendanceEvent[]): DailyGroupAttendancePoint[] {
  const dates = new Map<string, { worship: Set<string>; meeting: Set<string> }>();
  for (const event of events) {
    if (event.title !== "주일 예배" && event.title !== "순모임") continue;
    const ids = dates.get(event.eventDate) ?? { worship: new Set<string>(), meeting: new Set<string>() };
    ids[event.title === "주일 예배" ? "worship" : "meeting"].add(event.id);
    dates.set(event.eventDate, ids);
  }
  const groups = new Map<string, Member[]>();
  const presentByMember = new Map(members.map((member) => [member, new Set(member.attendanceHistory.filter((record) => record.status === "present").map((record) => record.eventId))]));
  for (const member of members) {
    const id = member.groupId || "unassigned";
    const roster = groups.get(id) ?? [];
    roster.push(member);
    groups.set(id, roster);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, ids]) =>
    [...groups].map(([groupId, roster]) => {
      let worship = 0, meeting = 0, combined = 0;
      for (const member of roster) {
        const present = presentByMember.get(member)!;
        const w = [...ids.worship].some((id) => present.has(id));
        const m = [...ids.meeting].some((id) => present.has(id));
        if (w) worship++;
        if (m) meeting++;
        if (w || m) combined++;
      }
      return { date, groupId, combined, worship: ids.worship.size ? worship : null, meeting: ids.meeting.size ? meeting : null };
    }),
  );
}

export function filterDailyAttendance(rows: DailyGroupAttendancePoint[], range: AttendanceRange, groupId: string): DailyAttendancePoint[] {
  const dates = new Map<string, DailyAttendancePoint>();
  for (const row of rows) {
    if (!inAttendanceRange(row.date, range) || (groupId !== "all" && row.groupId !== groupId)) continue;
    const point = dates.get(row.date) ?? { date: row.date, combined: 0, worship: null, meeting: null };
    point.combined += row.combined;
    if (row.worship !== null) point.worship = (point.worship ?? 0) + row.worship;
    if (row.meeting !== null) point.meeting = (point.meeting ?? 0) + row.meeting;
    dates.set(row.date, point);
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}
