import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { configuredEnv, input, jobRow, requestId, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";

const env = { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" };

function setup({ status = "running", denied = false, claim = "claimed", matches = [true,true,true,true], revokeDuringVision = false,
  researchStatus = "completed", wrongDate = false } = {}) {
  let rowStatus = status;
  let saved = 0;
  let vision = 0;
  let polls = 0;
  let claimed = false;
  let revoked = denied;
  const now = new Date().toISOString();
  const candidate = verifiedResult(now);
  candidate.songs.forEach((song) => { song.scoreImageVerified = false; });
  if (wrongDate) candidate.devotional.date = "2000-01-01";
  const client = { rpc: async (name, params) => {
    if (revoked) return { error: { code: "P0001" } };
    if (name === "get_prayer_generation_task") return { data: { input, status: rowStatus, created_at: now, api_trigger_id: "responses_v1" } };
    if (name === "claim_prayer_response_result") {
      if (claimed || claim !== "claimed") return { data: { state: claimed ? "busy" : claim } };
      claimed = true;
      return { data: { state: "claimed", run_id: "resp_fixture" } };
    }
    if (name === "report_prayer_generation_status") rowStatus = params.p_status;
    else if (name === "complete_prayer_generation_request") {
      saved += 1;
      assert.equal(params.p_entries.length, 8);
      assert.equal(JSON.stringify(params.p_entries).includes("duranno.com"), false);
      assert.ok(params.p_result.songs.every((song) => song.scoreImageVerified));
      rowStatus = "completed";
    } else throw new Error(`unexpected RPC ${name}`);
    return { data: jobRow({ status: rowStatus, ...(rowStatus === "completed" ? { meeting_id: "50000000-0000-4000-8000-000000000001" } : {}) }) };
  } };
  const load = createPrayerModuleLoader({ env, mocks: {
    "@supabase/supabase-js": { createClient: () => client },
    "next/cache": { revalidatePath() { throw new Error("worker cannot depend on request cache context"); } },
    "./prayer-responses-client": {
      getPrayerResponse: async () => { polls += 1; return { status: researchStatus, result: candidate }; },
      verifyPrayerScoreImages: async () => { vision += 1; revoked = revokeDuringVision; return matches.every(Boolean); },
    },
  } });
  return { run: load("src/lib/prayer-response-completion.ts").completePrayerResponse,
    state: () => ({ status: rowStatus, saved, vision, polls }) };
}

test("server research -> actual image verification -> audited save path completes without MCP or browser session", async () => {
  const app = setup();
  assert.equal(await app.run(requestId, input), true);
  assert.deepEqual(app.state(), { status: "completed", saved: 1, vision: 1, polls: 1 });
  assert.equal(await app.run(requestId, input), true);
  assert.equal(app.state().saved, 1, "completed replay does not write or verify twice");
});

test("cancelled, completed, expired/revoked and claim losers cannot incur provider or image costs", async () => {
  for (const options of [{ status: "cancelled" }, { status: "completed" }, { denied: true }, { claim: "busy" }, { claim: "done" }]) {
    const app = setup(options);
    await app.run(requestId, input);
    assert.equal(app.state().polls, 0);
    assert.equal(app.state().vision, 0);
    assert.equal(app.state().saved, 0);
  }
});

test("provider completion alone, wrong date and mismatched images never become saved success", async () => {
  for (const options of [{ researchStatus: "needs_input" }, { wrongDate: true }, { matches: [true,false,true,true] }]) {
    const app = setup(options);
    try { await app.run(requestId, input); } catch { /* Image failure is persisted; next tick observes terminal state. */ }
    assert.equal(app.state().status, "needs_input");
    assert.equal(app.state().saved, 0);
  }
});

test("registration revoked while vision is running prevents the final DB save", async () => {
  const app = setup({ revokeDuringVision: true });
  await assert.rejects(app.run(requestId, input));
  assert.equal(app.state().saved, 0);
  assert.equal(await app.run(requestId, input), true);
});

test("parallel UI/worker polls use a single result claim and one image verification", async () => {
  const app = setup();
  await Promise.all([app.run(requestId, input), app.run(requestId, input)]);
  assert.equal(app.state().polls, 1);
  assert.equal(app.state().vision, 1);
  assert.equal(app.state().saved, 1);
});

test("worker deadline is terminal without another paid research call", async () => {
  const app = setup();
  assert.equal(await app.run(requestId, input, true), true);
  assert.deepEqual(app.state(), { status: "failed", saved: 0, vision: 0, polls: 0 });
});

test("workflow enqueue is idempotent and contains no tokens or model result", async () => {
  let calls = 0;
  const load = createPrayerModuleLoader({ mocks: {
    "workflow/api": { start: async (_fn, args, options) => {
      calls += 1;
      assert.equal(JSON.stringify(args), JSON.stringify([requestId, input]));
      assert.equal(options.experimental_hook.token, `prayer-completion:${requestId}`);
      assert.equal(options.experimental_hook.experimental_minRetention, "1 day");
      if (calls === 2) throw { duplicate: true };
      if (calls === 3) throw new Error("credential-containing transport error");
    } },
    "workflow/errors": { HookConflictError: { is: (error) => error.duplicate === true } },
    "@/workflows/prayer-generation": { finishPrayerGeneration() {} },
  } });
  const { schedulePrayerCompletion } = load("src/lib/prayer-workflow-server.ts");
  await schedulePrayerCompletion(requestId, input);
  await schedulePrayerCompletion(requestId, input);
  await assert.rejects(schedulePrayerCompletion(requestId, input), /prayer-worker-start-unconfirmed/);
});

test("durable worker resumes after pending results and transient failures", async () => {
  let checks = 0;
  let sleeps = 0;
  const load = createPrayerModuleLoader({ mocks: {
    "workflow": { sleep: async (duration) => { assert.equal(duration, "20s"); sleeps += 1; } },
    "@/lib/prayer-response-completion": { completePrayerResponse: async () => {
      checks += 1;
      if (checks === 1) throw new Error("transport");
      return checks === 3;
    } },
  } });
  await load("src/workflows/prayer-generation.ts").finishPrayerGeneration(requestId, input);
  assert.equal(checks, 3);
  assert.equal(sleeps, 2);
  const route = readFileSync(new URL("../src/app/api/prayer-agent/mcp/route.ts", import.meta.url), "utf8");
  assert.match(route, /config.provider === "responses".*status: 404/);
});
