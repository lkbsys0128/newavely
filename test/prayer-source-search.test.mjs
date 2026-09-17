import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { safeSourceUrl, fetchPrayerSources } = loadTsModule("../src/lib/prayer-source-search.ts");
const { prayerEntrySchema } = loadTsModule("../src/lib/prayer-meetings.ts");

test("source links allow HTTPS pages and reject executable or local URLs", () => {
  assert.equal(safeSourceUrl("https://example.com/song?q=test"), true);
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:pw@example.com", "https://127.0.0.1", "https://host.local", "https://[::1]"]) {
    assert.equal(safeSourceUrl(url), false);
    assert.equal(prayerEntrySchema.safeParse({ title: "찬양", detail: "", sourceUrl: url }).success, false);
  }
  assert.equal(prayerEntrySchema.safeParse({ title: "찬양", detail: "" }).success, true);
});

test("search uses fixed API host, server header, timeout and returns links without lyrics", async () => {
  let called = 0;
  const result = await fetchPrayerSources("테스트 찬양", { clientId: "test-id", clientSecret: "test-secret" }, async (url, options) => {
    called++;
    assert.equal(url.origin, "https://openapi.naver.com");
    assert.equal(url.pathname, called === 1 ? "/v1/search/webkr.json" : "/v1/search/blog.json");
    assert.equal(url.searchParams.get("query"), "테스트 찬양 찬양 가사");
    assert.equal(url.searchParams.get("display"), "5");
    assert.equal(options.headers["X-Naver-Client-Id"], "test-id");
    assert.equal(options.headers["X-Naver-Client-Secret"], "test-secret");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ items: [
      { title: "<b>Song</b> &amp; Praise", link: "https://example.com/song", description: "Do not return lyrics" },
      { title: "Duplicate", link: "https://example.com/song" },
      { title: "Unsafe", link: "javascript:alert(1)" },
    ] }) };
  });
  assert.equal(called, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].url, "https://example.com/song");
  assert.equal(result[0].title, "Song & Praise");
  assert.equal(result[0].description, undefined);
  await assert.rejects(fetchPrayerSources("test", { clientId: "id", clientSecret: "secret" }, async () => ({ ok: false })));
});

test("Naver search tolerates one failed source and upgrades only legacy Naver blog URLs", async () => {
  const result = await fetchPrayerSources("곡명", { clientId: "id", clientSecret: "secret" }, async (url) => {
    if (url.pathname.includes("webkr")) throw new Error("timeout");
    return { ok: true, json: async () => ({ items: [
      { title: "찬양", link: "http://blog.naver.com/test/123" },
      { title: "Untrusted HTTP", link: "http://example.com/song" },
    ] }) };
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].url, "https://blog.naver.com/test/123");
});

test("Naver search interleaves categories and distinguishes empty results from failures", async () => {
  const credentials = { clientId: "id", clientSecret: "secret" };
  const result = await fetchPrayerSources("곡명", credentials, async (url) => ({ ok: true, json: async () => ({ items:
    Array.from({ length: 5 }, (_, index) => ({ title: `Song ${index}`, link: `https://example.com${url.pathname}/${index}` }))
  }) }));
  assert.equal(result.length, 6);
  assert.ok(result[0].url.includes("webkr"));
  assert.ok(result[1].url.includes("blog"));
  assert.equal((await fetchPrayerSources("곡명", credentials, async () => ({ ok: true, json: async () => ({ items: [] }) }))).length, 0);
  await assert.rejects(fetchPrayerSources("곡명", credentials, async () => ({ ok: true, json: async () => ({ invalid: [] }) })));
});

test("source migration retains audited versioned saves and authenticated rate limits", () => {
  const sql = readFileSync(new URL("../db/042_prayer_source_links.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /return used <= 20/);
  assert.match(sql, /prior.version <> p_version/);
  assert.match(sql, /perform record_audit_log/);
  assert.match(sql, /'sourceUrl'/);
  assert.ok(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8").includes(sql.trim()));
});
