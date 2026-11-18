import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { input, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";
const load = createPrayerModuleLoader();
const { preparePartialPrayer } = load("src/lib/prayer-partial-result.ts");
const { createPrayerGenerationDraft } = load("src/lib/prayer-generation-draft.ts");
const now = "2026-11-04T20:00:00.000Z";
const options = { now: Date.parse(now), createdAt: now, requestToken: "test-capability-never-persist" };

test("reported incomplete score pages are not marked complete even when one image exists", async () => {
  const result = verifiedResult(now);
  const draft = await preparePartialPrayer(input, result, async () => true, {
    ...options, issues: [{ code: "score_unavailable", songIndex: 4 }],
  });
  assert.equal(draft.entries[6].sourceUrl, result.songs[3].lyricsUrl);
  assert.equal(draft.entries[6].additionalSourceUrls.length, 0);
  assert.equal(draft.issues.length, 1);
});

test("later song failure retains earlier songs, lyrics and devotional in an unsaved draft", async () => {
  const result = verifiedResult(now);
  result.songs[3].scoreImageUrl = "";
  const checked = [];
  const draft = await preparePartialPrayer(input, result, async song => { checked.push(song.requestedTitle); return true; }, options);
  assert.equal(checked.length, 3);
  assert.equal(draft.entries[1].additionalSourceUrls.length, 1);
  assert.equal(draft.entries[6].sourceUrl, result.songs[3].lyricsUrl);
  assert.equal(draft.entries[6].additionalSourceUrls.length, 0);
  assert.equal(draft.issues.length, 1);
  assert.equal(draft.issues[0].entryIndex, 6);
  assert.match(draft.issues[0].message, /찬양 4.*악보/);
  assert.match(draft.entries[4].detail, /아모스/);
  assert.doesNotMatch(JSON.stringify(draft), /duranno|requestToken|test-capability/);
  assert.deepEqual(createPrayerGenerationDraft(input, draft).entries, draft.entries);
});

test("first song failure does not prevent later verification; image mismatch preserves lyrics", async () => {
  const result = verifiedResult(now);
  const checked = [];
  const draft = await preparePartialPrayer(input, result, async song => { checked.push(song.requestedTitle); return checked.length !== 1; }, options);
  assert.equal(checked.length, 4);
  assert.equal(draft.entries[1].sourceUrl, result.songs[0].lyricsUrl);
  assert.equal(draft.entries[1].additionalSourceUrls.length, 0);
  assert.equal(draft.entries[6].additionalSourceUrls.length, 1);
  assert.equal(draft.issues.length, 1);
});

test("missing lyrics can retain verified scores; stale, mismatched and unsafe results are excluded", async () => {
  const result = verifiedResult(now);
  result.songs[0].lyricsUrl = ""; result.songs[0].lyricsVerified = false;
  result.songs[1].requestedTitle = "wrong";
  result.songs[2].verifiedAt = "2020-01-01T00:00:00.000Z";
  result.songs[3].scoreImageUrl = "http://localhost/test.png";
  result.devotional.date = "2026-11-05";
  const draft = await preparePartialPrayer(input, result, async () => true, options);
  assert.equal(draft.entries[1].sourceUrl, result.songs[0].scoreImageUrl);
  assert.equal(draft.entries[2].sourceUrl, undefined);
  assert.equal(draft.entries[5].sourceUrl, undefined);
  assert.equal(draft.entries[6].sourceUrl, result.songs[3].lyricsUrl);
  assert.equal(draft.entries[4].detail, "");
  assert.equal(draft.issues.length, 7);
});
