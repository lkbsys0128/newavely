import type { Role } from "@/lib/rbac";

const roleRank: Record<Role, number> = {
  owner: 5,
  admin: 4,
  leader: 3,
  staff: 3,
  welcome: 1,
  member: 1,
};

export function canUseDeleteActions(role: Role) {
  return roleRank[role] >= roleRank.leader;
}

export function canDeleteMemberRole({ actorRole, targetRole }: { actorRole: Role; targetRole: Role }) {
  return canUseDeleteActions(actorRole) && roleRank[actorRole] > roleRank[targetRole];
}

export function canChangeMemberRole({
  actorRole,
  targetCurrentRole,
  nextRole,
  activeAdminCount,
  activeOwnerCount,
}: {
  actorRole: Role;
  targetCurrentRole: Role;
  nextRole: Role;
  activeAdminCount: number;
  activeOwnerCount: number;
}) {
  if ((targetCurrentRole === "owner" || nextRole === "owner") && actorRole !== "owner") return false;
  if (targetCurrentRole === "owner" && nextRole !== "owner" && activeOwnerCount <= 1) return false;
  return !(targetCurrentRole === "admin" && nextRole !== "admin" && nextRole !== "owner" && activeAdminCount <= 1);
}

export function getRoleChangeBlockReason({
  actorRole,
  targetCurrentRole,
  nextRole,
  activeAdminCount,
  activeOwnerCount,
}: {
  actorRole: Role;
  targetCurrentRole: Role;
  nextRole: Role;
  activeAdminCount: number;
  activeOwnerCount: number;
}) {
  if (canChangeMemberRole({ actorRole, targetCurrentRole, nextRole, activeAdminCount, activeOwnerCount })) return "";
  if ((targetCurrentRole === "owner" || nextRole === "owner") && actorRole !== "owner") {
    return "최고 관리자 권한은 최고 관리자만 변경할 수 있습니다.";
  }
  if (targetCurrentRole === "owner" && nextRole !== "owner" && activeOwnerCount <= 1) {
    return "마지막 최고 관리자는 다른 역할로 변경할 수 없습니다. 먼저 다른 최고 관리자를 지정해주세요.";
  }
  return "마지막 관리자는 최고 관리자로 승격하는 경우를 제외하고 다른 역할로 변경할 수 없습니다. 먼저 다른 관리자를 지정해주세요.";
}
