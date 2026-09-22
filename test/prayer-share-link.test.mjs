import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { buildPrayerShareLink } = loadTsModule("../src/lib/prayer-share-link.ts");

test("share links identify the displayed saved event without edit or pagination state", () => {
  const url = new URL(buildPrayerShareLink("https://newavely.com/prayer?new=1&page=2", "event-123"));
  assert.equal(url.pathname, "/prayer");
  assert.equal(url.search, "?id=event-123");
  assert.equal(buildPrayerShareLink("http://localhost:3020", "a&b"), "http://localhost:3020/prayer?id=a%26b");
});

test("copy control handles success and denied clipboard access without changing public permissions", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const ui = read("../src/components/prayer-meeting-page.tsx");
  assert.match(ui, /meeting && !editing && !error/);
  assert.match(ui, /await navigator.clipboard.writeText\(url\)/);
  assert.match(ui, /setCopyState\("failed"\)/);
  assert.match(ui, /readOnly value=\{shareUrl\}/);
  assert.match(ui, /aria-label="기도회 링크 복사"/);
  const page = read("../src/app/prayer/page.tsx");
  assert.match(page, /supabase.rpc\("get_latest_prayer_meeting"\)/);
  assert.match(page, /Ignore all event\/history query parameters for public viewers/);
});
