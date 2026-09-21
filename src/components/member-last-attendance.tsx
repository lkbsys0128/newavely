import { getLastAttendanceDate } from "@/lib/member-last-attendance";
import type { Member } from "@/lib/types";

export function MemberLastAttendance({ member }: { member: Member }) {
  const date = member.attendanceHistoryHidden ? "" : getLastAttendanceDate(member.attendanceHistory);
  return <p className="member-last-attendance">
    <span>마지막 출석</span>
    <strong>{member.attendanceHistoryHidden ? "비공개" : date ? <time dateTime={date}>{date}</time> : "출석 기록 없음"}</strong>
  </p>;
}
