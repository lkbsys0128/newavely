import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { configuredEnv, input, jobRow, requestId, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";

function memberClient(rpc, status = "active") {
  return { auth: { getUser: async () => ({ data: { user: { id: "member-fixture" } }, error: null }) },
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: "member", status }, error: null }) }; },
    rpc };
}

function actionLoader(client, request, env = configuredEnv) {
  return createPrayerModuleLoader({ env, fetch: request, mocks: {
    "@/lib/supabase/server": { createClient: async () => client }, "next/cache": { revalidatePath() {} },
    "@/lib/prayer-workflow-server": { schedulePrayerCompletion: async () => {} },
  } })("src/app/prayer/generation-actions.ts");
}

test("unregistered member and disabled configuration cannot enqueue or trigger", async () => {
  for (const status of ["new", "inactive", null]) {
    const actions = actionLoader(memberClient(async () => { throw new Error("must not enqueue"); }, status), async () => { throw new Error("must not trigger"); });
    const result = await actions.startPrayerGeneration({ requestId, ...input });
    assert.equal(result.ok, false);
    assert.match(result.message, /등록 승인/);
  }
  const actions = actionLoader(null, async () => { throw new Error("must not trigger"); }, {});
  assert.equal((await actions.startPrayerGeneration({ requestId, ...input })).ok, false);
});

test("unknown dispatch retries the same event and capability, then stops dispatching once recorded", async () => {
  let row;
  let storedHash;
  let createCount = 0;
  const calls = [];
  const client = memberClient(async (name, params) => {
    if (name === "create_prayer_generation_request") {
      if (!row) { row = jobRow(); storedHash = params.p_token_hash; createCount += 1; }
      assert.equal(params.p_token_hash, storedHash);
    } else if (name === "mark_prayer_generation_dispatched") row = { ...row, dispatched: true };
    else throw new Error(`unexpected RPC ${name}`);
    return { data: row, error: null };
  });
  const actions = actionLoader(client, async (_url, options) => {
    calls.push(options);
    if (calls.length === 1) throw new Error("accepted but connection lost");
    return Response.json({ conversation_url: "https://chatgpt.com/c/test", agent_trigger_run_id: "apirun_fixture" }, { status: 202 });
  });
  const first = await actions.startPrayerGeneration({ requestId, ...input });
  assert.equal(first.job.status, "queued");
  assert.equal(first.uncertain, true);
  const second = await actions.startPrayerGeneration({ requestId, ...input });
  assert.equal(second.ok, true);
  await actions.startPrayerGeneration({ requestId, ...input });
  assert.equal(createCount, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  const prompt = JSON.parse(calls[0].body).input;
  const envelope = JSON.parse(prompt.split("\n").at(-1));
  assert.equal(createHash("sha256").update(envelope.requestToken).digest("hex"), storedHash);
  assert.equal(JSON.stringify(second).includes(envelope.requestToken), false);
  assert.equal(JSON.stringify(second).includes(configuredEnv.PRAYER_AGENT_ACCESS_TOKEN), false);
});

test("a lost enqueue response is explicitly uncertain so the browser preserves the nonce", async () => {
  const actions = actionLoader(memberClient(async () => { throw new Error("commit response lost"); }), async () => { throw new Error("must not dispatch yet"); });
  const result = await actions.startPrayerGeneration({ requestId, ...input });
  assert.equal(result.ok, false);
  assert.equal(result.uncertain, true);
});

test("running callback does not prevent recovering lost dispatch metadata", async () => {
  let row = jobRow();
  let attempts = 0;
  const dispatched = [];
  const actions = actionLoader(memberClient(async (name) => {
    if (name === "mark_prayer_generation_dispatched") {
      attempts += 1;
      row = { ...row, status: "running" };
      if (attempts === 1) return { error: { code: "NETWORK" }, data: null };
      row = { ...row, dispatched: true };
    }
    return { data: row, error: null };
  }), async (_url, options) => {
    dispatched.push(options);
    return Response.json({ conversation_url: "https://chatgpt.com/c/test", agent_trigger_run_id: "apirun_fixture" }, { status: 202 });
  });
  assert.equal((await actions.startPrayerGeneration({ requestId, ...input })).uncertain, true);
  assert.equal((await actions.startPrayerGeneration({ requestId, ...input })).job.status, "running");
  await actions.startPrayerGeneration({ requestId, ...input });
  assert.equal(dispatched.length, 2);
  assert.equal(dispatched[0].body, dispatched[1].body);
  assert.equal(dispatched[0].headers["Idempotency-Key"], dispatched[1].headers["Idempotency-Key"]);
});

test("agent run completion alone is failure, while a simultaneous saved result remains completed", async () => {
  for (const savedDuringPoll of [false, true]) {
    let row = jobRow();
    const client = memberClient(async (name) => {
      if (name === "claim_prayer_generation_poll") return { data: { api_trigger_id: "agtch_test_channel", run_id: "apirun_fixture" } };
      if (name === "fail_prayer_generation_dispatch" && row.status !== "completed") row = { ...row, status: "failed", message: "저장되지 않음" };
      return { data: row, error: null };
    });
    const actions = actionLoader(client, async () => {
      if (savedDuringPoll) row = { ...row, status: "completed", meeting_id: "50000000-0000-4000-8000-000000000001", message: "저장 완료" };
      return Response.json({ status: "completed" });
    });
    const result = await actions.getPrayerGenerationJob(requestId);
    assert.equal(result.job.status, savedDuringPoll ? "completed" : "failed");
    assert.equal(Boolean(result.job.meetingId), savedDuringPoll);
  }
});

test("callback authorizes the capability before validation and saves only server-built entries", async () => {
  const token = "T".repeat(43);
  let saved;
  let calls = 0;
  const client = { rpc: async (name, params) => {
    calls += 1;
    if (params.p_token !== token) return { data: null, error: { code: "P0001" } };
    if (name === "get_prayer_generation_task") return { data: { input, created_at: new Date(Date.now() - 60_000).toISOString() } };
    if (name === "complete_prayer_generation_request") {
      saved = params;
      return { data: jobRow({ status: "completed", meeting_id: "50000000-0000-4000-8000-000000000001", message: "저장 완료" }) };
    }
    throw new Error(`Unexpected RPC ${name}`);
  } };
  const load = createPrayerModuleLoader({ env: { ...configuredEnv, NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-fixture-key" }, mocks: {
    "@supabase/supabase-js": { createClient: () => client }, "next/cache": { revalidatePath() {} },
  } });
  const { prayerGenerationToolHandlers: handlers } = load("src/lib/prayer-generation-callback.ts");
  const result = verifiedResult(new Date().toISOString());
  assert.equal((await handlers.submit({ requestId, requestToken: "X".repeat(43), result })).isError, true);
  assert.equal(saved, undefined);
  const accepted = await handlers.submit({ requestId, requestToken: token, result });
  assert.equal(accepted.status, "completed");
  assert.equal(saved.p_entries.length, 8);
  assert.equal(JSON.stringify(saved.p_entries).includes("duranno.com"), false);
  assert.equal(JSON.stringify(accepted).includes(token), false);
  assert.equal(accepted.meetingUrl, `https://newavely.example.test/prayer?id=${accepted.meetingId}`);
  const priorCalls = calls;
  assert.equal((await handlers.report({ requestId, requestToken: token, status: "running", message: token })).isError, true);
  assert.equal(calls, priorCalls, "secret-containing messages never reach persistence");
});

test("untrusted dispatch metadata cannot use the server token to poll another agent channel", async () => {
  let fetched = false;
  const actions = actionLoader(memberClient(async (name) => ({ error: null, data: name === "claim_prayer_generation_poll"
    ? { api_trigger_id: "agtch_unrelated_channel", run_id: "apirun_unrelated" } : jobRow() })),
  async () => { fetched = true; throw new Error("must not use token for another channel"); });
  const result = await actions.getPrayerGenerationJob(requestId);
  assert.equal(result.job.status, "queued");
  assert.equal(fetched, false);
});

test("Responses reserves once and never repeats a POST after an uncertain acceptance", async () => {
  let row = jobRow();
  let posts = 0;
  let reservations = 0;
  const actions = actionLoader(memberClient(async (name) => {
    if (name === "reserve_prayer_response_dispatch") {
      reservations += 1;
      row = { ...row, dispatched: true };
      return { data: true, error: null };
    }
    return { data: row, error: null };
  }), async () => { posts += 1; throw new Error("lost acknowledgement"); },
  { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture" });
  assert.equal((await actions.startPrayerGeneration({ requestId, ...input })).uncertain, true);
  await actions.startPrayerGeneration({ requestId, ...input });
  assert.equal(posts, 1);
  assert.equal(reservations, 1);
});

test("Responses reservation losers and failed reservation reads never call the paid API", async () => {
  for (const reservation of [{ data: false, error: null }, { data: null, error: { code: "NETWORK" } }]) {
    let posts = 0;
    const actions = actionLoader(memberClient(async (name) => name === "reserve_prayer_response_dispatch" ? reservation : { data: jobRow(), error: null }),
      async () => { posts += 1; throw new Error("must not dispatch"); },
      { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture" });
    await actions.startPrayerGeneration({ requestId, ...input });
    assert.equal(posts, 0);
  }
});

test("Responses worker registration failure can recover without another model dispatch", async () => {
  let row = jobRow();
  let posts = 0;
  let workers = 0;
  const client = memberClient(async (name) => {
    if (name === "reserve_prayer_response_dispatch") return { data: true };
    if (name === "mark_prayer_response_dispatched") row = { ...row, dispatched: true };
    return { data: row };
  });
  const load = createPrayerModuleLoader({ env: { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture" },
    fetch: async () => { posts += 1; return Response.json({ id: "resp_fixture", status: "queued", metadata: { prayer_request_id: requestId } }); },
    mocks: { "@/lib/supabase/server": { createClient: async () => client }, "next/cache": { revalidatePath() {} },
      "@/lib/prayer-workflow-server": { schedulePrayerCompletion: async () => { if (++workers === 1) throw new Error("queue transport"); } },
    } });
  const actions = load("src/app/prayer/generation-actions.ts");
  assert.equal((await actions.startPrayerGeneration({ requestId, ...input })).uncertain, true);
  assert.equal((await actions.startPrayerGeneration({ requestId, ...input })).ok, true);
  assert.equal(posts, 1);
  assert.equal(workers, 2);
});

test("Responses progress reads can finalize through the server and expose only a saved meeting ID", async () => {
  let row = jobRow();
  let invalidations = 0;
  const load = createPrayerModuleLoader({ env: { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture" }, mocks: {
    "@/lib/supabase/server": { createClient: async () => memberClient(async () => ({ data: row })) },
    "next/cache": { revalidatePath() { invalidations += 1; } },
    "@/lib/prayer-workflow-server": { schedulePrayerCompletion: async () => { throw new Error("queue down"); } },
    "@/lib/prayer-response-completion": { completePrayerResponse: async (id, original) => {
      assert.equal(id, requestId);
      assert.equal(JSON.stringify(original), JSON.stringify(input));
      row = jobRow({ status: "completed", meeting_id: "50000000-0000-4000-8000-000000000001", run_id: "resp_private" });
    } },
  } });
  const result = await load("src/app/prayer/generation-actions.ts").getPrayerGenerationJob(requestId);
  assert.equal(result.job.status, "completed");
  assert.ok(result.job.meetingId);
  assert.equal(JSON.stringify(result).includes("resp_private"), false);
  assert.equal(invalidations, 1);
});

test("Responses callback authenticates before image costs and saves only after every score matches", async () => {
  for (const matches of [[true,true,true,true], [true,false,true,true]]) {
    let saved = false;
    let images = 0;
    let reported;
    const token = "T".repeat(43);
    const candidate = verifiedResult(new Date().toISOString());
    candidate.songs.forEach((song) => { song.scoreImageVerified = false; });
    const load = createPrayerModuleLoader({ env: { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture",
      NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" },
      fetch: async () => { images += 1; return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ matches }) }] }] }); },
      mocks: { "next/cache": { revalidatePath() {} }, "@supabase/supabase-js": { createClient: () => ({ rpc: async (name, params) => {
        if (params.p_token !== token) return { error: { code: "P0001" } };
        if (name === "get_prayer_generation_task") return { data: { input, status: "running", api_trigger_id: "responses_v1", created_at: new Date(Date.now()-60_000).toISOString() } };
        if (name === "report_prayer_generation_status") { reported = params.p_status; return { data: {} }; }
        if (name === "save_prayer_generation_draft") { reported = "needs_input"; return { data: jobRow({ status: "needs_input", draft: params.p_draft }) }; }
        if (name === "complete_prayer_generation_request") {
          assert.ok(params.p_result.songs.every((song) => song.scoreImageVerified));
          saved = true;
          return { data: jobRow({ status: "completed", meeting_id: "50000000-0000-4000-8000-000000000001" }) };
        }
        throw new Error("unexpected RPC");
      } }) } } });
    const { prayerGenerationToolHandlers: handlers } = load("src/lib/prayer-generation-callback.ts");
    await handlers.submit({ requestId, requestToken: "X".repeat(43), result: candidate });
    assert.equal(images, 0);
    const result = await handlers.submit({ requestId, requestToken: token, result: candidate });
    assert.equal(images, matches.every(Boolean) ? 1 : 5);
    assert.equal(saved, matches.every(Boolean));
    assert.equal(result.status, matches.every(Boolean) ? "completed" : "needs_input");
    if (!saved) assert.equal(reported, "needs_input");
  }
});
