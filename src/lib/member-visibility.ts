import type { Role } from "@/lib/rbac";
import type { Group, Member } from "@/lib/types";

function isMergedPlaceholderForVisibility(member: Pick<Member, "email">) {
  return member.email.trim().toLowerCase().endsWith("@merged.local");
}

function isCommunityLeaderGroup(member: Pick<Member, "groupName">) {
  return member.groupName.trim().includes("공동체 리더");
}

function hasCommunityLeaderRole(member: Pick<Member, "customFields">) {
  const value = member.customFields.community_leader_role;
  return value === "clergy" || value === "team_leader" || value === "elder" || value === "deaconess";
}

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
  if (role === "owner" || role === "admin" || role === "leader") return true;
  if (role === "member") return member.id === currentMemberId;
  if (role === "welcome" && (isCommunityLeaderGroup(member) || hasCommunityLeaderRole(member))) return true;
  if (member.id === currentMemberId) return true;
  return Boolean(member.groupId && ledGroupIds.has(member.groupId));
}

export function maskMemberToDirectoryEntry(member: Member): Member {
  return {
    ...member,
    authUserId: null,
    phone: "비공개",
    role: "member",
    status: member.status,
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
  const visibleMembers = members.filter((member) => !isMergedPlaceholderForVisibility(member));

  if (role === "owner" || role === "admin" || role === "leader") return visibleMembers;

  const ledGroupIds = getLedGroupIds(currentMemberId, groups);
  if (role === "assistant") {
    const currentMember = visibleMembers.find((member) => member.id === currentMemberId);
    if (currentMember?.groupId) ledGroupIds.add(currentMember.groupId);
  }
  return visibleMembers.map((member) =>
    canViewFullMemberDetail({ role, currentMemberId, ledGroupIds, member }) ? member : maskMemberToDirectoryEntry(member),
  );
}
