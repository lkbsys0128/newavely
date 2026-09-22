import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
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
  const share = read("../src/components/prayer-share.tsx");
  assert.match(share, /await navigator.clipboard.writeText\(url\)/);
  assert.match(share, /setCopyState\("failed"\)/);
  assert.match(share, /readOnly value=\{url\}/);
  assert.match(share, /aria-haspopup="dialog"/);
  assert.match(share, /showModal\(\)/);
  assert.match(share, /QRCodeSVG value=\{url\}.*marginSize=\{4\}/);
  assert.match(share, /setExpanded\(!expanded\)/);
  const page = read("../src/app/prayer/page.tsx");
  assert.match(page, /supabase.rpc\("get_latest_prayer_meeting"\)/);
  assert.match(page, /Ignore all event\/history query parameters for public viewers/);
});

test("QR renderer generates different QR patterns for different event links", () => {
  const render = (id) => renderToStaticMarkup(createElement(QRCodeSVG, { value: buildPrayerShareLink("https://newavely.com", id), size: 640, marginSize: 4, level: "M" }));
  const first = render("event-one");
  assert.match(first, /<svg/);
  assert.match(first, /<path/);
  assert.notEqual(first, render("event-two"));
});
