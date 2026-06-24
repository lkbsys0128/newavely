"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/navigation";
import { getSectionEmoji } from "@/lib/ui-emojis";

export function MobileAwareNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  function closeMobileMenu() {
    const control = document.getElementById("mobile-menu-control");
    if (control instanceof HTMLInputElement) {
      control.checked = false;
    }
  }

  return (
    <nav className="nav-list" aria-label="앱 섹션">
      {items.map((item) => (
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
