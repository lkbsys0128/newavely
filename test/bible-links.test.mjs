import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { bibleBooks, buildBibleLink, parseBibleLink } = loadTsModule("../src/lib/bible-links.ts");
const { prayerEntrySchema } = loadTsModule("../src/lib/prayer-meetings.ts");
const { preparePrayerTemplate } = loadTsModule("../src/lib/prayer-templates.ts");

test("all 66 books round-trip with valid chapter bounds", () => {
  assert.equal(bibleBooks.length, 66);
  assert.equal(bibleBooks.reduce((sum, book) => sum + book[1], 0), 1189);
  for (let book = 1; book <= 66; book++) {
    for (const chapter of [1, bibleBooks[book - 1][1]]) {
      const url = buildBibleLink(book, chapter);
      assert.equal(parseBibleLink(url).chapter, chapter);
      assert.equal(parseBibleLink(url).book, book);
      assert.equal(prayerEntrySchema.safeParse({ title: "묵상/나눔", detail: "", sourceUrl: url }).success, true);
    }
    assert.equal(buildBibleLink(book, bibleBooks[book - 1][1] + 1), "");
  }
  for (const book of [0, 67, 1.5, NaN]) assert.equal(buildBibleLink(book, 1), "");
});

test("HolyBible exceptions reject arbitrary HTTP and malformed links", () => {
  const url = buildBibleLink(13, 19);
  assert.equal(url, "http://www.holybible.or.kr/mobile/B_GAE/cgi-m/bibleftxt.php?VR=GAE&VL=13&CN=19&CV=99");
  assert.equal(parseBibleLink(url).label, "역대상 19장");
  for (const invalid of [url + "&redirect=evil", url + "#x", url.replace(".or.kr", ".or.kr.evil.com"), url.replace("CN=19", "CN=30"), url.replace("VL=13", "VL=67"), url.replace("www.", "user@www."), "http://example.com"]) {
    assert.equal(parseBibleLink(invalid), null);
    assert.equal(prayerEntrySchema.safeParse({ title: "묵상/나눔", detail: "", sourceUrl: invalid }).success, false);
  }
});

test("SQL and client share chapter limits and migration preserves save protections", () => {
  const sql = readFileSync(new URL("../db/047_prayer_bible_links.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(`array[${bibleBooks.map((book) => book[1]).join(",")}]`));
  assert.equal((sql.match(/and not public.is_prayer_bible_link/g) || []).length, 2);
  assert.equal((sql.match(/prior.version <> p_version/g) || []).length, 2);
  assert.equal((sql.match(/perform record_audit_log/g) || []).length, 2);
  assert.ok(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8").includes(sql.trim()));
});

test("template reset clears Bible link and keeping content preserves it", () => {
  const entries = [{ title: "묵상/나눔", detail: "나눔", sourceUrl: buildBibleLink(13, 19) }];
  assert.equal(preparePrayerTemplate(entries, true, false)[0].sourceUrl, undefined);
  assert.equal(preparePrayerTemplate(entries, false, false)[0].sourceUrl, entries[0].sourceUrl);
  assert.ok(entries[0].sourceUrl);
});
