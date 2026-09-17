import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("editorial preview is development-only and uses sample data", () => {
  const source = readFileSync(new URL("../src/app/design-preview/page.tsx", import.meta.url), "utf8");
  assert.match(source, /process.env.NODE_ENV !== "development"\) notFound\(\)/);
  assert.match(source, /sampleGroups, sampleMembers/);
  assert.doesNotMatch(source, /getAppPageData|service-role|createClient/);
});

test("editorial styling is scoped and constrains mobile grid width", () => {
  const css = readFileSync(new URL("../src/app/editorial.css", import.meta.url), "utf8");
  assert.match(css, /editorial-dashboard \{ display: grid; grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /:root\[data-theme="dark"\] \.editorial-dashboard/);
  assert.match(css, /@media \(max-width: 700px\)/);
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /getVisibleNavItems\(navRole\)/);
});

test("all pages share typography weights and autumn color tokens", () => {
  const theme = readFileSync(new URL("../src/app/autumn-theme.css", import.meta.url), "utf8");
  assert.match(theme, /--font-weight-ui: 650/);
  assert.match(theme, /button, input, select, textarea \{ font-family: inherit/);
  assert.match(theme, /:root\[data-theme="dark"\]/);
  for (const file of ["globals.css", "editorial.css"]) {
    const css = readFileSync(new URL(`../src/app/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(css, /font-weight: (?:700|750|800|850|900|950);/);
    assert.match(css, /font-weight: var\(--font-weight-ui\)/);
  }
  const chart = readFileSync(new URL("../src/components/attendance-line-chart.tsx", import.meta.url), "utf8");
  assert.match(chart, /var\(--chart-total\)/);
  assert.match(chart, /var\(--chart-youth\)/);
});

test("all Newave logo instances use the same seasonal treatment", () => {
  for (const file of ["app/layout.tsx", "components/auth-panel.tsx", "components/prayer-meeting-page.tsx", "components/dashboard.tsx"]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    const logos = source.match(/<(?:Image|img)\b[^>]*src="\/newave-icon-autumn.png"[^>]*>/g) ?? [];
    assert.ok(logos.length > 0);
    for (const logo of logos) assert.match(logo, /className="[^"]*seasonal-logo/);
  }
});

test("selection controls share interaction tokens without recoloring semantic status badges", () => {
  const css = readFileSync(new URL("../src/app/autumn-theme.css", import.meta.url), "utf8");
  const interactions = css.slice(css.indexOf("/* Navigation, selections"));
  for (const token of ["hover", "selected", "ink", "border", "solid"]) {
    assert.match(css, new RegExp(`--interaction-${token}:`));
    assert.match(interactions, new RegExp(`var\\(--interaction-${token}\\)`));
  }
  for (const selector of [".segment.active", ".attendance-group-chip.active", ".new-family-stage-chip.is-active", '.nav-list a[aria-current="page"]', '.section-nav a[aria-current="location"]']) {
    assert.ok(interactions.includes(selector));
  }
  assert.doesNotMatch(interactions, /\.status-pill|\.snapshot-status-button|\.leader-extra-toggle/);
  assert.match(interactions, /:hover:not\(:disabled\)/);
});

test("navigation and filter selections expose accessible state", () => {
  const nav = readFileSync(new URL("../src/components/section-nav.tsx", import.meta.url), "utf8");
  assert.match(nav, /aria-current=\{activeHref === item.href \? "location"/);
  assert.match(nav, /addEventListener\("hashchange", updateHash\)/);
  assert.match(nav, /removeEventListener\("hashchange", updateHash\)/);
  const ui = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  for (const condition of ['statusFilter === "all"', "statusFilter === status", "attendanceFilter === filter", "attendanceGroupId === group.id"]) {
    assert.ok(ui.includes(`aria-pressed={${condition}}`));
  }
});

test("brand palette preserves the four requested colors in both themes", () => {
  const css = readFileSync(new URL("../src/app/autumn-theme.css", import.meta.url), "utf8");
  for (const [name, color] of Object.entries({ vanilla: "#EDE4D5", jade: "#163C32", garnet: "#4A0B19", lavender: "#B19DC5" })) {
    assert.ok(css.includes(`--palette-${name}: ${color};`));
  }
  const dark = css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("body {"));
  assert.match(dark, /--surface: var\(--palette-jade\)/);
  assert.match(dark, /--ink: var\(--palette-vanilla\)/);
  assert.match(dark, /--interaction-hover-ink: var\(--palette-vanilla\)/);
  assert.match(dark, /--interaction-solid: var\(--palette-lavender\)/);
});
