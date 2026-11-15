import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
const { extractPrayerUsage, createPrayerUsageObserver } = createPrayerModuleLoader()("src/lib/prayer-usage.ts");
const payload = () => ({ id: "resp_usage", model: "gpt-5.4-2026-03-05",
  usage: { input_tokens: 30000, input_tokens_details: { cached_tokens: 10000 }, output_tokens: 5000,
    output_tokens_details: { reasoning_tokens: 4000 } },
  output: [{ type: "web_search_call", action: { type: "search" } },
    { type: "web_search_call", action: { type: "open_page" } }, { type: "function_call" }],
  private_prompt: "DO_NOT_STORE" });

test("usage counts cached tokens once, reasoning within output, and search actions only", () => {
  const result = extractPrayerUsage(payload(), "research");
  assert.equal(result.search_calls, 1);
  assert.equal(result.estimated_usd, 0.1375);
  assert.equal(JSON.stringify(result).includes("DO_NOT_STORE"), false);
  assert.equal(result.output_tokens, 5000);
});
test("missing usage and unknown model prices remain unknown, never zero dollars", () => {
  assert.equal(extractPrayerUsage({ ...payload(), usage: null }, "vision").estimated_usd, null);
  assert.equal(extractPrayerUsage({ ...payload(), model: "other-model" }, "vision").estimated_usd, null);
  const invalid = payload(); invalid.usage.input_tokens_details.cached_tokens = 40000;
  assert.equal(extractPrayerUsage(invalid, "research").input_tokens, null);
  assert.equal(extractPrayerUsage({ ...payload(), id: "PRIVATE_TOKEN" }, "research"), null);
});
test("long context uses the documented premium and keeps image usage in input tokens", () => {
  const value = payload(); value.usage.input_tokens = 300000;
  assert.ok(Math.abs(extractPrayerUsage(value, "vision").estimated_usd - 1.5775) < 1e-10);
});
test("accounting retries DB only and never leaks credentials on persistence failures", async (t) => {
  const logs = t.mock.method(console, "warn", () => {});
  let calls = 0;
  const observe = createPrayerUsageObserver({ rpc: async (_name, args) => {
    calls++; assert.equal(args.p_token, "SECRET");
    throw new Error("SECRET");
  } }, "request-id", "SECRET");
  await observe(payload(), "research");
  assert.equal(calls, 3);
  assert.equal(JSON.stringify(logs.mock.calls).includes("SECRET"), false);
});
