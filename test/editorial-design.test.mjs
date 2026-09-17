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
