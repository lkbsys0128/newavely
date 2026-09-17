import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { safeSourceUrl, fetchPrayerSources } = loadTsModule("../src/lib/prayer-source-search.ts");
const { prayerEntrySchema } = loadTsModule("../src/lib/prayer-meetings.ts");
const response = (items) => ({ ok: true, json: async () => ({ search_metadata: { status: "Success" }, organic_results: items }) });

test("source links allow HTTPS pages and reject executable or local URLs", () => {
  assert.equal(safeSourceUrl("https://example.com/song?q=test"), true);
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:pw@example.com", "https://127.0.0.1", "https://host.local", "https://[::1]"]) {
    assert.equal(safeSourceUrl(url), false);
    assert.equal(prayerEntrySchema.safeParse({ title: "찬양", detail: "", sourceUrl: url }).success, false);
  }
  assert.equal(prayerEntrySchema.safeParse({ title: "찬양", detail: "" }).success, true);
});

test("SerpApi uses one Korean Google search and only returns safe original links", async () => {
  let called = 0;
  const result = await fetchPrayerSources("테스트", "test-secret", async (url, options) => {
    called++;
    assert.equal(url.origin, "https://serpapi.com");
    assert.equal(url.pathname, "/search.json");
    assert.equal(url.searchParams.get("q"), "테스트 찬양 가사");
    assert.equal(url.searchParams.get("engine"), "google");
    assert.equal(url.searchParams.get("hl"), "ko");
    assert.equal(url.searchParams.get("gl"), "kr");
    assert.equal(url.searchParams.get("api_key"), "test-secret");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    return response([
      { title: "Song &amp; Praise", link: "https://example.com/song", snippet: "Do not return lyrics", redirect_link: "https://google.com/redirect" },
      { title: "Duplicate", link: "https://example.com/song" },
      { title: "Unsafe", link: "javascript:alert(1)" },
      { title: "HTTP", link: "http://example.com/song" }, null,
    ]);
  });
  assert.equal(called, 1);
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), ["domain", "title", "url"]);
  assert.equal(result[0].url, "https://example.com/song");
  assert.equal(result[0].title, "Song & Praise");
});

test("SerpApi failures never expose provider errors or credentials", async () => {
  for (const payload of [null, {}, { error: "secret-key" }, { search_metadata: { status: "Error" } }, { search_metadata: { status: "Success" }, organic_results: {} }]) {
    await assert.rejects(fetchPrayerSources("곡명", "secret-key", async () => ({ ok: true, json: async () => payload })), (error) => !error.message.includes("secret-key"));
  }
  await assert.rejects(fetchPrayerSources("곡명", "secret-key", async () => ({ ok: false })));
  const action = readFileSync(new URL("../src/app/prayer/search-actions.ts", import.meta.url), "utf8");
  assert.match(action, /process.env.SERPAPI_API_KEY/);
  assert.match(action, /claim_prayer_source_search/);
  assert.match(action, /member.status === "inactive"/);
  assert.match(action, /if \(!user\)/);
  assert.doesNotMatch(action, /console\.|NEXT_PUBLIC_|NAVER_SEARCH/);
});

test("SerpApi caps candidates and handles successful empty searches", async () => {
  const result = await fetchPrayerSources("곡명", "key", async () => response(Array.from({ length: 10 }, (_, index) => ({ title: `Song ${index}`, link: `https://example.com/${index}` }))));
  assert.equal(result.length, 6);
  assert.equal(result[0].url, "https://example.com/0");
  assert.equal((await fetchPrayerSources("곡명", "key", async () => response([]))).length, 0);
  assert.equal((await fetchPrayerSources("곡명", "key", async () => response(undefined))).length, 0);
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
