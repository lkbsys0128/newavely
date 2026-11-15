import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { requestId } from "./helpers/prayer-generation-fixture.mjs";
const { triggerWorkspaceAgent, getWorkspaceAgentRun, AgentDispatchError } = createPrayerModuleLoader()("src/lib/workspace-agent-client.ts");
const config = { triggerId: "agtch_fixture", accessToken: "fixture-private-token" };

test("trigger uses the published API channel, private bearer, stable idempotency and request-scoped conversation", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ conversation_url: "https://chatgpt.com/c/fixture", agent_trigger_run_id: "apirun_fixture" }, { status: 202 });
  };
  const a = await triggerWorkspaceAgent(config, { requestId, input: "same input" }, request);
  await triggerWorkspaceAgent(config, { requestId, input: "same input" }, request);
  assert.equal(a.runId, "apirun_fixture");
  assert.equal(calls[0].url, "https://api.chatgpt.com/v1/workspace_agents/agtch_fixture/trigger");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${config.accessToken}`);
  assert.equal(calls[0].options.headers["Idempotency-Key"], calls[1].options.headers["Idempotency-Key"]);
  assert.equal(calls[0].options.redirect, "error");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.conversation_key, `prayer-request:${requestId}`);
  assert.equal(body.input, "same input");
  assert.equal(calls[0].options.body.includes(config.accessToken), false);
});

test("timeout and malformed acceptance remain uncertain while explicit authorization failure is definitive", async () => {
  for (const request of [async () => { throw new Error("timeout"); }, async () => Response.json({ unexpected: true }, { status: 202 }), async () => new Response("down", { status: 503 })]) {
    await assert.rejects(triggerWorkspaceAgent(config, { requestId, input: "input" }, request), (error) => error instanceof AgentDispatchError && error.definitive === false);
  }
  await assert.rejects(triggerWorkspaceAgent(config, { requestId, input: "input" }, async () => new Response("private detail", { status: 403 })),
    (error) => error.definitive && !error.message.includes("private detail"));
  await assert.rejects(triggerWorkspaceAgent({ ...config, triggerId: "../../elsewhere" }, { requestId, input: "input" }, async () => { throw new Error("must not fetch"); }));
});

test("run polling returns status only and rejects external response data", async () => {
  assert.equal(await getWorkspaceAgentRun(config, "apirun_fixture", async () => Response.json({ status: "completed", private: "unused" })), "completed");
  await assert.rejects(getWorkspaceAgentRun(config, "apirun_fixture", async () => Response.json({ status: "saved" })));
});
