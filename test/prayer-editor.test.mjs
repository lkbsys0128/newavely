import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";
const { toPrayerEditEntry, changePrayerItemType, prayerItemTypes } = loadTsModule("../src/lib/prayer-editor.ts");

test("prayer preset choices and existing custom titles remain intact", () => {
  assert.deepEqual(Array.from(prayerItemTypes), ["기도", "찬양", "묵상/나눔"]);
  for (const title of prayerItemTypes) assert.equal(toPrayerEditEntry({ title, detail: "내용" }, "one").kind, title);
  const custom = toPrayerEditEntry({ title: "오프닝 기도", detail: "담당자" }, "one");
  assert.equal(custom.kind, "custom");
  const song = changePrayerItemType(custom, "찬양");
  assert.equal(song.title, "찬양");
  assert.equal(song.detail, "담당자");
  assert.equal(changePrayerItemType(song, "custom").title, "오프닝 기도");
  assert.equal(changePrayerItemType(toPrayerEditEntry({ title: "기도", detail: "" }, "two"), "custom").title, "");
});
