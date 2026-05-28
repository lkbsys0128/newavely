import type { Role } from "@/lib/rbac";

export function canChangeMemberRole({
  targetCurrentRole,
  nextRole,
  activeAdminCount,
}: {
  targetCurrentRole: Role;
  nextRole: Role;
  activeAdminCount: number;
}) {
  return !(targetCurrentRole === "admin" && nextRole !== "admin" && activeAdminCount <= 1);
}

export function getRoleChangeBlockReason({
  targetCurrentRole,
  nextRole,
  activeAdminCount,
}: {
  targetCurrentRole: Role;
  nextRole: Role;
  activeAdminCount: number;
}) {
  if (canChangeMemberRole({ targetCurrentRole, nextRole, activeAdminCount })) return "";
  return "마지막 관리자는 다른 역할로 변경할 수 없습니다. 먼저 다른 관리자를 지정해주세요.";
}
