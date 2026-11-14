import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { configuredEnv, requestId, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";
const load = createPrayerModuleLoader();
const { readPrayerAgentConfig } = load("src/lib/prayer-agent-server.ts");
const { triggerPrayerResponse, getPrayerResponse, verifyPrayerScoreImages } = load("src/lib/prayer-responses-client.ts");
const env = { ...configuredEnv, PRAYER_GENERATION_PROVIDER: "responses", OPENAI_API_KEY: "fixture-openai-secret" };
const config = readPrayerAgentConfig(env);
const run = (status = "in_progress", id = requestId) => ({ id: "resp_test", status, metadata: { prayer_request_id: id } });

test("Responses requires explicit provider, enabled flag, key, signing secret and HTTPS callback origin", () => {
  assert.equal(config.provider, "responses");
  assert.equal(config.model, "gpt-5.4");
  assert.equal(config.triggerId, "responses_v1");
  for (const change of [{ OPENAI_API_KEY: "" }, { PRAYER_GENERATION_ENABLED: "false" }, { PRAYER_AGENT_SIGNING_SECRET: "short" },
    { PRAYER_AGENT_APP_URL: "http://localhost" }, { PRAYER_AGENT_APP_URL: "https://example.com/path" }, { PRAYER_GENERATION_PROVIDER: "typo" }]) {
    assert.equal(readPrayerAgentConfig({ ...env, ...change }), null);
  }
});

test("Responses dispatch attaches only web research and the two scoped callbacks without leaking API key", async () => {
  const result = await triggerPrayerResponse(config, { requestId, input: "private-scoped-input" }, async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
    const body = JSON.parse(options.body);
    assert.equal(body.background, true);
    assert.equal(body.max_tool_calls, 24);
    assert.equal(body.metadata.prayer_request_id, requestId);
    assert.equal(body.tools[1].server_url, "https://newavely.example.test/api/prayer-agent/mcp");
    assert.deepEqual(body.tools[1].allowed_tools, ["report_prayer_generation_status", "submit_prayer_generation_result"]);
    assert.equal(options.body.includes(env.OPENAI_API_KEY), false);
    return Response.json(run());
  });
  assert.equal(result.runId, "resp_test");
  assert.equal(result.conversationUrl, null);
});

test("Responses uncertainty is never treated as explicit rejection; polling binds response to request", async () => {
  await assert.rejects(triggerPrayerResponse(config, { requestId, input: "input" }, async () => { throw new Error("private payload"); }),
    (error) => !error.definitive && !error.message.includes("private payload"));
  await assert.rejects(triggerPrayerResponse(config, { requestId, input: "input" }, async () => new Response("secret", { status: 401 })),
    (error) => error.definitive && !error.message.includes("secret"));
  assert.equal(await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run("incomplete"))), "failed");
  assert.equal(await getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run("completed"))), "completed");
  await assert.rejects(getPrayerResponse(config, "resp_test", requestId, async () => Response.json(run("completed", "40000000-0000-4000-8000-000000000002"))));
  await assert.rejects(getPrayerResponse(config, "../../anything", requestId, async () => { throw new Error("must not fetch"); }));
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
