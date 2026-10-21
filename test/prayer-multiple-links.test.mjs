import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { prayerEntrySchema, prayerEntryLinks, serializePrayerEntry } = loadTsModule("../src/lib/prayer-meetings.ts");
const { preparePrayerTemplate } = loadTsModule("../src/lib/prayer-templates.ts");
const { buildBibleLink } = loadTsModule("../src/lib/bible-links.ts");

test("link labels survive saving and templates, while stale labels are removed", () => {
  const url = "https://example.com/song";
  const entry = { title: "찬양", detail: "Song", sourceUrl: url, sourceLabels: { [url]: " 찬양 영상 ", "https://example.com/old": "old" } };
  const saved = serializePrayerEntry(entry);
  assert.equal(saved.sourceLabels[url], "찬양 영상");
  assert.equal(Object.keys(saved.sourceLabels).length, 1);
  assert.equal(prayerEntrySchema.safeParse(saved).success, true);
  assert.equal(preparePrayerTemplate([saved], false)[0].sourceLabels[url], "찬양 영상");
  assert.equal(preparePrayerTemplate([saved])[0].sourceLabels, undefined);
  assert.equal(entry.sourceLabels[url], " 찬양 영상 ");
  assert.equal(serializePrayerEntry({ ...entry, sourceUrl: "" }).sourceLabels, undefined);
});

test("label validation rejects unsafe URL keys, non-text labels and excessive size", () => {
  for (const sourceLabels of [{ "javascript:alert(1)": "bad" }, { "https://example.com": 1 }, { "https://example.com": "x".repeat(121) }, Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`https://example.com/${i}`, "label"]))]) {
    assert.equal(prayerEntrySchema.safeParse({ title: "찬양", sourceLabels }).success, false);
  }
});

test("legacy links and additional links round-trip without editor metadata", () => {
  const entry = { title: "찬양", detail: "Song", sourceUrl: "https://example.com/one", additionalSourceUrls: ["", "https://example.com/two"], key: "row", linkKeys: ["a", "b"] };
  const saved = serializePrayerEntry(entry);
  assert.equal(saved.key, undefined);
  assert.equal(saved.linkKeys, undefined);
  assert.deepEqual(Array.from(saved.additionalSourceUrls), ["https://example.com/two"]);
  assert.equal(prayerEntrySchema.safeParse(saved).success, true);
  assert.deepEqual(Array.from(prayerEntryLinks(saved)), [entry.sourceUrl, entry.additionalSourceUrls[1]]);
  assert.equal(serializePrayerEntry({ title: "찬양", detail: "" }).additionalSourceUrls, undefined);
});

test("all extra URLs are validated with the same limits as the first link", () => {
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:pw@example.com", "https://127.0.0.1", "https://example.com/" + "x".repeat(2000)]) {
    assert.equal(prayerEntrySchema.safeParse({ title: "찬양", additionalSourceUrls: [url] }).success, false);
  }
  assert.equal(prayerEntrySchema.safeParse({ title: "찬양", additionalSourceUrls: Array(10).fill("https://example.com") }).success, false);
  assert.equal(prayerEntrySchema.safeParse({ title: "찬양", additionalSourceUrls: [123] }).success, false);
  assert.equal(prayerEntrySchema.safeParse({ title: "묵상/나눔", additionalSourceUrls: [buildBibleLink(1, 1), buildBibleLink(43, 3)] }).success, true);
});

test("public links omit unsafe values and duplicates", () => {
  assert.deepEqual(Array.from(prayerEntryLinks({ title: "찬양", detail: "", sourceUrl: "https://example.com", additionalSourceUrls: ["https://example.com", "javascript:alert(1)", "", buildBibleLink(1, 1)] })), ["https://example.com", buildBibleLink(1, 1)]);
});

test("template content reset removes every song and meditation link without mutating the source", () => {
  const entries = ["찬양", "묵상/나눔"].map((title) => ({ title, detail: "content", sourceUrl: "https://example.com/one", additionalSourceUrls: ["https://example.com/two"] }));
  for (const entry of preparePrayerTemplate(entries)) {
    assert.equal(entry.sourceUrl, undefined);
    assert.equal(entry.additionalSourceUrls, undefined);
  }
  for (const entry of preparePrayerTemplate(entries, false)) {
    assert.deepEqual(Array.from(entry.additionalSourceUrls), ["https://example.com/two"]);
  }
  assert.equal(entries[0].additionalSourceUrls.length, 1);
});
