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
  const result = await fetchPrayerSources("테스트 찬양", "test-key", async (url, options) => {
    called++;
    assert.equal(url.origin, "https://api.search.brave.com");
    assert.equal(url.searchParams.get("q"), "테스트 찬양 찬양 가사 lyrics");
    assert.equal(options.headers["X-Subscription-Token"], "test-key");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ web: { results: [
      { title: "Song", url: "https://example.com/song", description: "Do not return lyrics" },
      { title: "Duplicate", url: "https://example.com/song" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ] } }) };
  });
  assert.equal(called, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].url, "https://example.com/song");
  assert.equal(result[0].description, undefined);
  await assert.rejects(fetchPrayerSources("test", "key", async () => ({ ok: false })));
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
