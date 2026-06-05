"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSectionEmoji } from "@/lib/ui-emojis";

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/profile", label: "내 프로필" },
  { href: "/members", label: "멤버" },
  { href: "/groups", label: "순" },
  { href: "/attendance", label: "출석" },
  { href: "/links", label: "링크" },
  { href: "/feedback", label: "피드백" },
  { href: "/permissions", label: "권한" },
  { href: "/audit", label: "감사 로그" },
];

export function MobileAwareNav() {
  const pathname = usePathname();

  function closeMobileMenu() {
    const control = document.getElementById("mobile-menu-control");
    if (control instanceof HTMLInputElement) {
      control.checked = false;
    }
  }

  return (
    <nav className="nav-list" aria-label="앱 섹션">
      {navItems.map((item) => (
        <Link
          aria-current={pathname === item.href ? "page" : undefined}
          href={item.href}
          key={item.href}
          onClick={closeMobileMenu}
        >
          <span className="ui-emoji nav-emoji" aria-hidden="true">
            {getSectionEmoji(item.label)}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
