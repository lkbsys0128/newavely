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

export function getRoleForEmail(email: string, metadataRole?: string): Role {
  if (metadataRole && roles.includes(metadataRole as Role)) return metadataRole as Role;
  if (!email) return "admin";
  if (email.includes("+leader@")) return "leader";
  if (email.includes("+staff@")) return "staff";
  if (email.includes("+member@")) return "member";
  return "admin";
}
