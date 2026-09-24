import type { Member } from "@/lib/types";

// Roll back only the failed event keys; never replace another member or newer profile data.
export function restoreAttendanceEvents(current: Member[], before: Member, eventIds: string[], selectedEventId: string | undefined) {
  const ids = new Set(eventIds);
  return current.map((member) => member.id !== before.id ? member : {
    ...member,
    present: selectedEventId && ids.has(selectedEventId) ? before.present : member.present,
    attendanceHistory: [
      ...member.attendanceHistory.filter((record) => !ids.has(record.eventId)),
      ...before.attendanceHistory.filter((record) => ids.has(record.eventId)),
    ],
  });
}
