"use client";

import { useEffect, useState } from "react";
import { getSectionEmoji } from "@/lib/ui-emojis";

export type SectionNavItem = {
  href: string;
  label: string;
};

export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [activeHref, setActiveHref] = useState("");

  useEffect(() => {
    const updateHash = () => setActiveHref(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  if (items.length === 0) return null;

  return (
    <nav className="section-nav" aria-label="페이지 섹션">
      <div className="section-nav-links">
        {items.map((item) => (
          <a href={item.href} key={item.href} aria-current={activeHref === item.href ? "location" : undefined} onClick={() => setActiveHref(item.href)}>
            <span className="ui-emoji section-nav-emoji" aria-hidden="true">
              {getSectionEmoji(item.label)}
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
