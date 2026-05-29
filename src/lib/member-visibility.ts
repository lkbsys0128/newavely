import type { Role } from "@/lib/rbac";
import type { Group, Member } from "@/lib/types";

export function getLedGroupIds(currentMemberId: string, groups: Group[]) {
  return new Set(groups.filter((group) => group.leaderMemberId === currentMemberId).map((group) => group.id));
}

export function canViewFullMemberDetail({
  role,
  currentMemberId,
  ledGroupIds,
  member,
}: {
  role: Role;
  currentMemberId: string;
  ledGroupIds: Set<string>;
  member: Member;
}) {
  if (role !== "staff") return true;
  if (member.id === currentMemberId) return true;
  return Boolean(member.groupId && ledGroupIds.has(member.groupId));
}

export function maskMemberToDirectoryEntry(member: Member): Member {
  return {
    ...member,
    authUserId: null,
    phone: "비공개",
    role: "member",
    status: "active",
    email: "",
    address: "비공개",
    baptismStatus: "비공개",
    notes: "",
    customFields: {},
    present: false,
    attendanceHistory: [],
    careFollowups: [],
  };
}

export function scopeMembersForRole({
  role,
  currentMemberId,
  groups,
  members,
}: {
  role: Role;
  currentMemberId: string;
  groups: Group[];
  members: Member[];
}) {
  if (role !== "staff") return members;

  const ledGroupIds = getLedGroupIds(currentMemberId, groups);
  return members.map((member) =>
    canViewFullMemberDetail({ role, currentMemberId, ledGroupIds, member }) ? member : maskMemberToDirectoryEntry(member),
  );
}
