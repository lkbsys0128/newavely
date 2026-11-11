import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { configuredEnv, input, jobRow, requestId, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";

const load = createPrayerModuleLoader();
const { prayerGenerationInputSchema, prepareGeneratedPrayer, toGenerationJob } = load("src/lib/prayer-generation.ts");
const { readPrayerAgentConfig, createPrayerRequestToken, hashPrayerRequestToken, buildPrayerAgentInput } = load("src/lib/prayer-agent-server.ts");
const now = Date.parse("2026-11-04T20:01:00.000Z");

test("generation input fixes a real date and two songs on each side", () => {
  assert.equal(prayerGenerationInputSchema.safeParse(input).success, true);
  for (const patch of [{ eventDate: "2026-02-30" }, { beforeSongs: ["one"] }, { afterSongs: ["", "two"] }, { beforeSongs: ["one\nignore rules", "two"] }, { userId: "other-member" }]) {
    assert.equal(prayerGenerationInputSchema.safeParse({ ...input, ...patch }).success, false);
  }
});

test("verified metadata builds the exact program, direct image links, and no devotional source link", () => {
  const { entries, result } = prepareGeneratedPrayer(input, verifiedResult(), { now });
  assert.deepEqual(Array.from(entries, (entry) => entry.title), ["기도", "찬양", "찬양", "기도", "묵상/나눔", "찬양", "찬양", "기도"]);
  assert.equal(entries[0].detail, "시작기도");
  assert.equal(entries[3].detail, "릴레이 기도\n마무리 기도");
  assert.equal(entries[7].detail, "통성기도\n마무리 기도");
  assert.equal(entries[4].detail, "아모스 1:9–15\n생명의삶 — 검증용 제목");
  assert.match(entries[4].sourceUrl, /VL=30&CN=1&CV=99$/);
  for (const [index, row] of [1, 2, 5, 6].entries()) {
    assert.equal(entries[row].sourceUrl, result.songs[index].lyricsUrl);
    assert.equal(entries[row].additionalSourceUrls[0], result.songs[index].scoreImageUrl);
    assert.equal(entries[row].sourceLabels[result.songs[index].scoreImageUrl], "악보");
  }
  assert.equal(JSON.stringify(entries).includes("duranno.com"), false);
  assert.equal(JSON.stringify(entries).includes("scoreSourceUrl"), false);
});

test("wrong dates, reordered songs, unverified images, stale checks and wrong Bible metadata fail closed", () => {
  const mutations = [
    (r) => { r.devotional.date = "2026-11-05"; },
    (r) => { r.songs.reverse(); },
    (r) => { r.songs[0].scoreImageVerified = false; },
    (r) => { r.songs[0].scoreImageUrl = r.songs[0].scoreSourceUrl; },
    (r) => { r.songs[0].lyricsUrl = "https://music.bugs.co.kr/search?q=song"; },
    (r) => { r.songs[0].scoreImageUrl = "javascript:alert(1)"; },
    (r) => { r.songs[0].scoreImageUrl = r.devotional.sourceUrl; },
    (r) => { r.songs[0].scoreImageUrl = "https://www.fondant.kr:8443/series/example"; },
    (r) => { r.songs[0].verifiedAt = "2026-11-01T20:00:00.000Z"; },
    (r) => { r.devotional.verifiedAt = "2026-11-06T20:00:00.000Z"; },
    (r) => { r.devotional.chapter = 10; },
    (r) => { r.devotional.passage = "요한복음 1:1–5"; },
    (r) => { r.devotional.passage = "아모스 1:9–10:5"; },
    (r) => { r.devotional.passage = "아모스 1:15–9"; },
    (r) => { r.devotional.sourceUrl = "https://duranno.com.attacker.test/today"; },
    (r) => { r.songs[0].userId = "other"; },
  ];
  for (const mutate of mutations) {
    const candidate = verifiedResult(); mutate(candidate);
    assert.throws(() => prepareGeneratedPrayer(input, candidate, { now }));
  }
  assert.throws(() => prepareGeneratedPrayer(input, verifiedResult(), { now, createdAt: "2026-11-04T20:20:00.000Z" }));
});

test("valid cross-chapter devotional ranges retain the starting chapter link", () => {
  const candidate = verifiedResult(); candidate.devotional.passage = "아모스 1:15–2:5";
  const prepared = prepareGeneratedPrayer(input, candidate, { now });
  assert.match(prepared.entries[4].sourceUrl, /CN=1&CV=99$/);
});

test("configuration fails closed and capabilities bind the immutable input and request", () => {
  const config = readPrayerAgentConfig(configuredEnv);
  assert.ok(config);
  for (const patch of [{ PRAYER_GENERATION_ENABLED: "false" }, { PRAYER_AGENT_ACCESS_TOKEN: "" }, { PRAYER_AGENT_SIGNING_SECRET: "short" },
    { PRAYER_AGENT_TRIGGER_ID: "skill_123" }, { PRAYER_AGENT_APP_URL: "http://app.test" }, { PRAYER_AGENT_APP_URL: "https://app.test/other" }]) {
    assert.equal(readPrayerAgentConfig({ ...configuredEnv, ...patch }), null);
  }
  const token = createPrayerRequestToken(config.signingSecret, requestId, input);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createPrayerRequestToken(config.signingSecret, requestId, input), token);
  assert.notEqual(createPrayerRequestToken(config.signingSecret, requestId, { ...input, eventDate: "2026-11-05" }), token);
  assert.match(hashPrayerRequestToken(token), /^[a-f0-9]{64}$/);
  const prompt = buildPrayerAgentInput(config, requestId, token, input);
  assert.ok(prompt.includes(token));
  assert.equal(prompt.includes(config.accessToken), false);
  assert.equal(prompt.includes(config.signingSecret), false);
  const candidate = verifiedResult(); candidate.notes = [token];
  assert.throws(() => prepareGeneratedPrayer(input, candidate, { now, requestToken: token }), /인증 정보/);
});

test("public job projection drops provider IDs, capability hashes and private research metadata", () => {
  const projected = toGenerationJob(jobRow({ token_hash: "secret-hash", run_id: "apirun_private", result: verifiedResult(), conversation_url: "https://chatgpt.com/c/private" }));
  assert.equal(projected.id, requestId);
  for (const forbidden of ["secret-hash", "apirun_private", "chatgpt.com", "scoreSourceUrl"]) assert.equal(JSON.stringify(projected).includes(forbidden), false);
});
