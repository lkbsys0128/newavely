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
