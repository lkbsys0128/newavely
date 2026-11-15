import { z } from "zod";

const count = z.number().int().nonnegative().max(1_000_000_000);
export const prayerUsageSchema = z.object({
  response_id: z.string().regex(/^resp_[A-Za-z0-9_-]{1,160}$/),
  stage: z.enum(["research", "vision"]),
  model: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  input_tokens: count.nullable(), cached_tokens: count.nullable(), output_tokens: count.nullable(),
  search_calls: count, estimated_usd: z.number().nonnegative().nullable(),
  pricing_version: z.literal("2026-11-14-standard"),
});
export type PrayerUsage = z.infer<typeof prayerUsageSchema>;
export type UsageObserver = (payload: unknown, stage: "research" | "vision") => Promise<void>;

export function extractPrayerUsage(payload: unknown, stage: "research" | "vision"): PrayerUsage | null {
  const envelope = z.object({ id: z.string(), model: z.string(), usage: z.unknown().optional(),
    output: z.array(z.object({ type: z.string(), action: z.object({ type: z.string() }).optional() }).passthrough()).optional(),
  }).safeParse(payload);
  if (!envelope.success) return null;
  const data = envelope.data;
  const usage = z.object({ input_tokens: count, output_tokens: count,
    input_tokens_details: z.object({ cached_tokens: count }),
  }).refine((value) => value.input_tokens_details.cached_tokens <= value.input_tokens).safeParse(data.usage);
  const searches = (data.output ?? []).filter((item) => item.type === "web_search_call" && item.action?.type === "search").length;
  const knownModel = /^gpt-5\.4(?:-2026-03-05)?$/.test(data.model);
  // Reasoning tokens are already included in output_tokens. Images are input tokens.
  let estimate: number | null = null;
  if (usage.success && knownModel && data.output) {
    const { input_tokens: input, output_tokens: output, input_tokens_details: { cached_tokens: cached } } = usage.data;
    const longContext = input > 272_000;
    estimate = ((input - cached) * 2.5 + cached * 0.25) * (longContext ? 2 : 1) / 1_000_000
      + output * 15 * (longContext ? 1.5 : 1) / 1_000_000 + searches * 0.01;
  }
  const result = prayerUsageSchema.safeParse({ response_id: data.id, stage, model: data.model,
    input_tokens: usage.success ? usage.data.input_tokens : null,
    cached_tokens: usage.success ? usage.data.input_tokens_details.cached_tokens : null,
    output_tokens: usage.success ? usage.data.output_tokens : null,
    search_calls: searches, estimated_usd: estimate, pricing_version: "2026-11-14-standard" });
  return result.success ? result.data : null;
}

type UsageClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> };
export function createPrayerUsageObserver(client: UsageClient, requestId: string, token: string): UsageObserver {
  return async (payload, stage) => {
    const usage = extractPrayerUsage(payload, stage);
    if (!usage) { console.warn("prayer-usage: unavailable", { requestId, stage }); return; }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await client.rpc("record_prayer_api_usage", { p_id: requestId, p_token: token, p_usage: usage });
        if (!result.error) return;
      } catch { /* Retry only the idempotent accounting write, never a paid model call. */ }
    }
    console.warn("prayer-usage: persistence failed", { requestId, stage });
  };
}
