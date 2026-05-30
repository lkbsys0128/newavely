export type SectionNavItem = {
  href: string;
  label: string;
};

export function SectionNav({ items }: { items: SectionNavItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav className="section-nav" aria-label="페이지 섹션">
      <span className="section-nav-label">빠른 이동</span>
      <div className="section-nav-links">
        {items.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
