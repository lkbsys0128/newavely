import { getSectionEmoji } from "@/lib/ui-emojis";

export type SectionNavItem = {
  href: string;
  label: string;
};

export function SectionNav({ items }: { items: SectionNavItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav className="section-nav" aria-label="페이지 섹션">
      <div className="section-nav-links">
        {items.map((item) => (
          <a href={item.href} key={item.href}>
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
