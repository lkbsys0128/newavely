import assert from "node:assert/strict";
import test from "node:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { requestId, verifiedResult } from "./helpers/prayer-generation-fixture.mjs";

const { createPrayerGenerationMcpServer } = createPrayerModuleLoader()("src/lib/prayer-generation-mcp.ts");
async function rpc(body, handlers) {
  const server = createPrayerGenerationMcpServer(handlers);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(new Request("https://app.example.test/api/prayer-agent/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  } finally { await server.close(); }
}
const handlers = {
  report: async () => ({ status: "running", message: "확인 중" }),
  submit: async () => ({ status: "completed", message: "저장 완료", meetingId: "saved-fixture" }),
};

test("stateless MCP initializes and exposes only two bounded write callbacks", async () => {
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fixture", version: "1" } } }, handlers);
  assert.equal(init.status, 200);
  assert.equal(init.body.result.serverInfo.name, "newavely-prayer-generation");
  const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, handlers);
  assert.deepEqual(list.body.result.tools.map((tool) => tool.name).sort(), ["report_prayer_generation_status", "submit_prayer_generation_result"]);
  for (const tool of list.body.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, false);
    assert.equal(tool.annotations.idempotentHint, true);
    assert.ok(tool.inputSchema.required.includes("requestToken"));
    assert.ok(tool.inputSchema.required.includes("requestId"));
  }
});

test("MCP rejects malformed capabilities and extra fields before invoking a write handler", async () => {
  let called = 0;
  const denied = { ...handlers, report: async () => { called += 1; return { status: "running", message: "bad" }; } };
  for (const args of [{ requestId, requestToken: "short", status: "running", message: "test" },
    { requestId, requestToken: "T".repeat(43), status: "running", message: "test", userId: "other" }]) {
    const result = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "report_prayer_generation_status", arguments: args } }, denied);
    assert.ok(result.body.error || result.body.result?.isError);
  }
  assert.equal(called, 0);
});

test("MCP returns the actual authorized save outcome through the SDK transport", async () => {
  const result = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "submit_prayer_generation_result", arguments: {
    requestId, requestToken: "T".repeat(43), result: verifiedResult(),
  } } }, handlers);
  assert.equal(result.body.result.structuredContent.status, "completed");
  assert.equal(result.body.result.structuredContent.meetingId, "saved-fixture");
  assert.equal(JSON.stringify(result.body).includes("T".repeat(43)), false);
});
