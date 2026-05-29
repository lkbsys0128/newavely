import type { Role } from "@/lib/rbac";

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
