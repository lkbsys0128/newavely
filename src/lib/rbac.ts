export const roles = ["admin", "leader", "staff", "member"] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "members:read",
  "members:write",
  "attendance:read",
  "attendance:write",
  "groups:read",
  "groups:write",
  "roles:manage",
  "sensitive:read",
] as const;

export type Permission = (typeof permissions)[number];

export const permissionsByRole: Record<Role, Permission[]> = {
  admin: [...permissions],
  leader: ["members:read", "members:write", "attendance:read", "attendance:write", "groups:read"],
  staff: ["members:read", "attendance:read", "groups:read"],
  member: ["members:read", "groups:read"],
};

export function hasPermission(role: Role, permission: Permission) {
  return permissionsByRole[role].includes(permission);
}

export function getRoleForEmail(_email: string, _metadataRole?: string): Role {
  return "member";
}
