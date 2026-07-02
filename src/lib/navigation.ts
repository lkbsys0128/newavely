import { hasPermission, type Permission, type Role } from "@/lib/rbac";

export type NavItem = {
  href: string;
  label: string;
  requiredPermission?: Permission;
  hiddenForRoles?: Role[];
};

export const navItems: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/profile", label: "내 프로필" },
  { href: "/members", label: "멤버", requiredPermission: "members:read", hiddenForRoles: ["assistant", "welcome", "member"] },
  { href: "/new-family", label: "새가족", requiredPermission: "new-family:read" },
  { href: "/groups", label: "순", requiredPermission: "groups:read", hiddenForRoles: ["assistant", "welcome", "member"] },
  { href: "/attendance", label: "출석", requiredPermission: "attendance:read" },
  { href: "/calendar", label: "캘린더" },
  { href: "/links", label: "링크", requiredPermission: "links:read" },
  { href: "/feedback", label: "피드백" },
  { href: "/permissions", label: "권한" },
  { href: "/audit", label: "감사 로그", requiredPermission: "roles:manage" },
];

export function getVisibleNavItems(role: Role | null) {
  if (!role) return [];

  return navItems.filter((item) => {
    if (item.hiddenForRoles?.includes(role)) return false;
    if (!item.requiredPermission) return true;
    return hasPermission(role, item.requiredPermission);
  });
}
