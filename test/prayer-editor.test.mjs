import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";
const { toPrayerEditEntry, changePrayerItemType, prayerItemTypes, selectPrayerSource } = loadTsModule("../src/lib/prayer-editor.ts");

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

test("selecting a song source fills the song title and link together", () => {
  const entry = toPrayerEditEntry({ title: "찬양", detail: "기존 제목" }, "song");
  const selected = selectPrayerSource(entry, "https://example.com/song", "  주의 은혜라  ");
  assert.equal(selected.detail, "주의 은혜라");
  assert.equal(selected.sourceUrl, "https://example.com/song");
  assert.equal(selected.title, "찬양");
  assert.equal(entry.detail, "기존 제목");
  assert.equal(selectPrayerSource(selected, "").detail, "주의 은혜라");
  assert.equal(selectPrayerSource(selected, "https://example.com/new", "  ").detail, "주의 은혜라");
  const custom = toPrayerEditEntry({ title: "오프닝", detail: "담당자" }, "custom");
  assert.equal(selectPrayerSource(custom, "https://example.com/song", "곡명").detail, "담당자");
});
