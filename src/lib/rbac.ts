export const roles = ["owner", "admin", "leader", "staff", "assistant", "welcome", "member"] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "members:read",
  "members:write",
  "attendance:read",
  "attendance:write",
  "attendance:extras:read",
  "attendance:extras:write",
  "groups:read",
  "groups:write",
  "roles:manage",
  "owner:manage",
  "sensitive:read",
  "links:read",
  "links:write",
  "new-family:read",
  "new-family:write",
] as const;

export type Permission = (typeof permissions)[number];

export const permissionsByRole: Record<Role, Permission[]> = {
  owner: [...permissions],
  admin: permissions.filter((permission) => permission !== "owner:manage"),
  leader: ["members:read", "members:write", "attendance:read", "attendance:write", "groups:read", "links:read", "links:write"],
  staff: ["members:read", "members:write", "attendance:read", "attendance:write", "groups:read", "links:read", "links:write"],
  assistant: ["members:read", "attendance:read", "attendance:write", "groups:read", "links:read"],
  welcome: [
    "members:read",
    "attendance:read",
    "attendance:extras:read",
    "attendance:extras:write",
    "groups:read",
    "links:read",
    "new-family:read",
    "new-family:write",
  ],
  member: ["members:read", "groups:read", "links:read"],
};

export function hasPermission(role: Role, permission: Permission) {
  return permissionsByRole[role].includes(permission);
}

export function getRoleForEmail(_email: string, _metadataRole?: string): Role {
  return "member";
}
