import type { Group } from "@/lib/types";

const attendanceHiddenGroupNames = ["공동체 리더"];

export function isAttendanceVisibleGroup(group: Pick<Group, "name">) {
  const normalizedName = group.name.trim();
  return !attendanceHiddenGroupNames.some((hiddenName) => normalizedName.includes(hiddenName));
}

export function getAttendanceVisibleGroups(groups: Group[]) {
  return groups.filter(isAttendanceVisibleGroup);
}
