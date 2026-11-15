import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { configuredEnv, input, requestId, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";
const load = createPrayerModuleLoader();
const { readPrayerAgentConfig, buildPrayerAgentInput } = load("src/lib/prayer-agent-server.ts");
const { triggerPrayerResponse, getPrayerResponse, verifyPrayerScoreImages, continuePrayerResponse } = load("src/lib/prayer-responses-client.ts");
const env = { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture-openai-secret" };
const config = readPrayerAgentConfig(env);
const run = (status = "in_progress", id = requestId) => ({ id: "resp_test", status, metadata: { prayer_request_id: id } });

test("Responses requires explicit provider, enabled flag, key and signing secret but no callback origin", () => {
  assert.equal(config.provider, "responses");
  assert.equal(config.model, "gpt-5.4");
  assert.equal(config.triggerId, "responses_v1");
  assert.equal(readPrayerAgentConfig({ ...env, PRAYER_AGENT_APP_URL: "" }).appUrl, "");
  for (const change of [{ OPENAI_API_KEY: "" }, { PRAYER_GENERATION_ENABLED: "false" }, { PRAYER_AGENT_SIGNING_SECRET: "short" },
    { PRAYER_AGENT_APP_URL: "http://localhost" }, { PRAYER_AGENT_APP_URL: "https://example.com/path" }, { PRAYER_GENERATION_PROVIDER: "typo" }]) {
    assert.equal(readPrayerAgentConfig({ ...env, ...change }), null);
  }
});

test("Responses dispatch exposes research only, no MCP, callback URL or write capability", async () => {
  const token = "S".repeat(43);
  const prompt = buildPrayerAgentInput(config, requestId, token, input);
  assert.equal(prompt.includes(token), false);
  assert.equal(prompt.includes(config.appUrl), false);
  const result = await triggerPrayerResponse(config, { requestId, input: prompt }, async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
    const body = JSON.parse(options.body);
    assert.equal(body.background, true);
    assert.equal(body.max_tool_calls, 24);
    assert.equal(body.metadata.prayer_request_id, requestId);
    assert.deepEqual(body.tools.map((tool) => tool.type), ["web_search", "function"]);
    assert.equal(body.tools[1].name, "read_prayer_sources");
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(options.body.includes(token), false);
    assert.equal(options.body.includes(env.OPENAI_API_KEY), false);
    return Response.json(run());
  });
  assert.equal(result.runId, "resp_test");
  assert.equal(result.conversationUrl, null);
});

test("source tool calls resume the same response context instead of being mistaken for empty final output", async () => {
  const call = { type: "function_call", name: "read_prayer_sources", call_id: "call_fixture", arguments: JSON.stringify({ urls: ["https://music.bugs.co.kr/track/474529"] }) };
  const state = await getPrayerResponse(config, "resp_test", requestId, async () => Response.json({ ...run("completed"), output: [call] }));
  assert.equal(state.status, "tools_required");
  assert.equal(state.result, undefined);
  const nextId = await continuePrayerResponse(config, "resp_test", requestId, state.calls, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.previous_response_id, "resp_test");
    assert.equal(body.metadata.prayer_request_id, requestId);
    assert.equal(body.input[0].type, "function_call_output");
    assert.equal(body.input[0].call_id, "call_fixture");
    assert.equal(JSON.parse(body.input[0].output)[0].lyricsPresent, true);
    assert.ok(body.instructions.includes("historical"));
    return Response.json({ ...run(), id: "resp_next" });
  }, async () => [{ status: "read", lyricsPresent: true }]);
  assert.equal(nextId, "resp_next");
  const invalid = await getPrayerResponse(config, "resp_test", requestId, async () => Response.json({ ...run("completed"), output: [{ ...call, name: "write_database" }] }));
  assert.equal(invalid.status, "needs_input");
  await assert.rejects(continuePrayerResponse(config, "resp_test", requestId, [call], async () => { throw new Error("uncertain POST"); }, async () => []));
});

test("Responses uncertainty is never treated as explicit rejection; polling binds response to request", async () => {
  await assert.rejects(triggerPrayerResponse(config, { requestId, input: "input" }, async () => { throw new Error("private payload"); }),
    (error) => !error.definitive && !error.message.includes("private payload"));
  await assert.rejects(triggerPrayerResponse(config, { requestId, input: "input" }, async () => new Response("secret", { status: 401 })),
    (error) => error.definitive && !error.message.includes("secret"));
  assert.equal((await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run("incomplete")))).status, "failed");
  assert.equal((await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run("completed")))).status, "needs_input");
  await assert.rejects(getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run("completed", "40000000-0000-4000-8000-000000000002"))));
  await assert.rejects(getPrayerResponse(config, "../../anything", requestId, async () => { throw new Error("must not fetch"); }));
});

test("terminal response usage is observed before validation failure, never for pending or mismatched runs", async () => {
  const observed = [];
  const observer = async (payload, stage) => observed.push([payload.id, stage]);
  for (const status of ["queued", "in_progress", "failed", "incomplete", "completed"]) {
    await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run(status)), observer);
  }
  assert.equal(observed.length, 3);
  assert.equal(observed.every((entry) => entry[1] === "research"), true);
  await assert.rejects(getPrayerResponse(config, "resp_test", requestId,
    async () => Response.json(run("completed", "40000000-0000-4000-8000-000000000002")), observer));
  assert.equal(observed.length, 3);
  await assert.rejects(verifyPrayerScoreImages(config, verifiedResult(), async () => Response.json({
    id: "resp_image", status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }],
  }), observer));
  assert.deepEqual(observed.at(-1), ["resp_image", "vision"]);
});

test("completed research requires structured verified metadata; refusal and partial output never mean saved success", async () => {
  const candidate = verifiedResult(new Date().toISOString());
  candidate.songs.forEach((song) => { delete song.scoreKey; song.scoreImageVerified = false; });
  const output = (text) => ({ ...run("completed"), output: [{ type: "message", content: [{ type: "output_text", text }] }] });
  const ready = await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(output(JSON.stringify({ status: "ready", result: candidate }))));
  assert.equal(ready.status, "completed");
  assert.equal(ready.result.songs[0].scoreImageVerified, false);
  assert.equal(ready.meetingId, undefined);
  for (const text of ["not JSON", JSON.stringify({ status: "needs_input", result: null }), JSON.stringify({ status: "ready", result: null })]) {
    assert.equal((await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(output(text)))).status, "needs_input");
  }
});

test("source passage typography is normalized without accepting wrong books or reversed ranges", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  const candidate = verifiedResult(new Date().toISOString());
  candidate.devotional.chapter = 6;
  const response = async (passage) => {
    candidate.devotional.passage = passage;
    return getPrayerResponse(config, "resp_test", requestId, async () => Response.json({
      ...run("completed"), output: [{ type: "message", content: [{ type: "output_text",
        text: JSON.stringify({ status: "ready", issues: [], result: candidate }) }] }],
    }));
  };
  for (const passage of ["아모스 6 : 8~14", " 아모스  6:8 ～ 14 ", "아모스 6:8–14"]) {
    const result = await response(passage);
    assert.equal(result.status, "completed");
    assert.equal(result.result.devotional.passage, "아모스 6:8-14");
  }
  for (const passage of ["아모스 6:14~8", "아모스 5:8~14", "요한복음 6:8~14", "아모스\n6:8~14"]) {
    const result = await response(passage);
    assert.equal(result.status, "needs_input");
    assert.match(result.message, /devotional.passage/);
    assert.match(result.message, /invalid_domain_schema/);
  }
  const diagnostic = JSON.parse(warnings.mock.calls[0].arguments[1]);
  assert.deepEqual(diagnostic.issues[0].path, ["devotional", "passage"]);
  assert.equal(JSON.stringify(diagnostic).includes(candidate.songs[0].scoreImageUrl), false);
});

test("terminal provider failures distinguish output limits without logging private payloads", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  for (const [status, details, reason] of [
    ["incomplete", { incomplete_details: { reason: "max_output_tokens" } }, "output_limit"],
    ["incomplete", { incomplete_details: { reason: "content_filter" } }, "content_filter"],
    ["cancelled", {}, "cancelled"],
    ["failed", { error: { code: "PRIVATE_SECRET", message: "PRIVATE_SECRET" } }, "provider_error"],
  ]) {
    const result = await getPrayerResponse(config, "resp_test", requestId, async () => Response.json({ ...run(status), ...details }));
    assert.equal(result.status, "failed");
    assert.equal(result.reason, reason);
    assert.equal(result.result, undefined);
  }
  assert.equal(warnings.mock.callCount(), 4);
  assert.equal(JSON.stringify(warnings.mock.calls.map((call) => call.arguments)).includes("PRIVATE_SECRET"), false);
});

test("research blockers identify song slots and malformed results without exposing raw responses", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  const response = async (text) => getPrayerResponse(config, "resp_test", requestId, async () => Response.json({
    ...run("completed"), output: [{ type: "message", content: [{ type: "output_text", text }] }],
  }));
  const missing = await response(JSON.stringify({ status: "needs_input", result: null,
    issues: [{ code: "score_unavailable", songIndex: 3 }, { code: "devotional_unavailable", songIndex: null }] }));
  assert.match(missing.message, /찬양 3/);
  assert.match(missing.message, /생명의삶/);
  assert.match(missing.message, /research_missing/);
  const malformed = await response("PRIVATE_SECRET not json");
  assert.match(malformed.message, /invalid_json/);
  const invalid = await response(JSON.stringify({ status: "PRIVATE_SECRET", result: null, issues: [] }));
  assert.match(invalid.message, /invalid_research_schema/);
  const unknown = await response(JSON.stringify({ status: "needs_input", result: null,
    issues: [{ code: "PRIVATE_SECRET", songIndex: 1 }] }));
  assert.match(unknown.message, /invalid_research_schema/);
  const many = await response(JSON.stringify({ status: "needs_input", result: null,
    issues: Array.from({ length: 8 }, () => ({ code: "song_ambiguous", songIndex: 1 })) }));
  assert.ok(many.message.length <= 300);
  assert.match(many.message, /research_missing/);
  assert.equal(JSON.stringify([missing, malformed, invalid, unknown, warnings.mock.calls.map((call) => call.arguments)]).includes("PRIVATE_SECRET"), false);
});

test("score verification loads four image inputs and fails closed for mismatch, refusal and malformed output", async () => {
  const candidate = verifiedResult();
  for (const matches of [[true, true, true, true], [true, false, true, true]]) {
    assert.equal(await verifyPrayerScoreImages(config, candidate, async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      assert.equal(body.input[0].content.filter((item) => item.type === "input_image").length, 4);
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ matches }) }] }] });
    }), matches.every(Boolean));
  }
  assert.equal(await verifyPrayerScoreImages(config, candidate, async () => new Response("broken image", { status: 400 })), false);
  await assert.rejects(verifyPrayerScoreImages(config, candidate, async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] })));
});

test("vision verifies exactly the variable number of supplied songs", async () => {
  for (const count of [1, 3, 8]) {
    const candidate = verifiedResult();
    candidate.songs = Array.from({ length: count }, () => ({ ...candidate.songs[0] }));
    assert.equal(await verifyPrayerScoreImages(config, candidate, async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.input[0].content.filter((item) => item.type === "input_image").length, count);
      assert.equal(body.text.format.schema.properties.matches.minItems, count);
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ matches: Array(count).fill(true) }) }] }] });
    }), true);
  }
});

test("vision includes every score page and rejects a failed later page", async () => {
  const candidate = verifiedResult();
  candidate.songs[0].additionalScoreImageUrls = ["https://example.com/page2.png"];
  assert.equal(await verifyPrayerScoreImages(config, candidate, async (_url, options) => {
    const body = JSON.parse(options.body);
    const images = body.input[0].content.filter((item) => item.type === "input_image");
    assert.equal(images.length, 5);
    assert.equal(images[1].image_url, "https://example.com/page2.png");
    assert.equal(body.text.format.schema.properties.matches.minItems, 5);
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ matches: [true, false, true, true, true] }) }] }] });
  }), false);
});
