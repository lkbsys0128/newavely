import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { prayerGenerationInputSchema, prepareGeneratedPrayer, toGenerationJob } from "./prayer-generation";
import type { GenerationToolHandlers, GenerationToolResponse } from "./prayer-generation-mcp";
import { getPrayerAgentConfig } from "./prayer-agent-server";
import { verifyPrayerScoreImages } from "./prayer-responses-client";
import { createPrayerUsageObserver } from "./prayer-usage";
import { preparePartialPrayer } from "./prayer-partial-result";

function callbackClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  // The DB capability RPC, not a broad service-role identity, authorizes each operation.
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function failure(message = "요청을 처리할 수 없습니다. 요청 인증 정보, 유효 기간과 자료를 확인해주세요."): GenerationToolResponse {
  return { status: "error", message, isError: true };
}

function savedResult(data: unknown): GenerationToolResponse {
  const job = toGenerationJob(data);
  let meetingUrl: string | undefined;
  try {
    const origin = new URL(process.env.PRAYER_AGENT_APP_URL ?? "");
    if (origin.protocol === "https:" && !origin.username && !origin.password && job.meetingId) meetingUrl = `${origin.origin}/prayer?id=${job.meetingId}`;
  } catch { /* A saved meeting ID remains usable if the display URL is not configured. */ }
  return { status: job.status, message: job.message, ...(job.meetingId ? { meetingId: job.meetingId } : {}), ...(meetingUrl ? { meetingUrl } : {}) };
}

export function createPrayerGenerationHandlers(invalidate = true): GenerationToolHandlers { return {
  async report(input) {
    if (input.message.includes(input.requestToken)) return failure("요청 인증 정보는 상태 메시지에 포함할 수 없습니다.");
    try {
      const client = callbackClient();
      const { data, error } = await client.rpc("report_prayer_generation_status", {
        p_id: input.requestId, p_token: input.requestToken, p_status: input.status, p_message: input.message,
      });
      return error || !data ? failure() : savedResult(data);
    } catch { return failure(); }
  },
  async submit(input) {
    try {
      const client = callbackClient();
      const task = await client.rpc("get_prayer_generation_task", { p_id: input.requestId, p_token: input.requestToken });
      if (task.error || !task.data) return failure();
      if (task.data.status && !["queued", "running", "completed"].includes(task.data.status)) return failure();
      const original = prayerGenerationInputSchema.parse(task.data.input);
      const config = getPrayerAgentConfig();
      const requiresVision = task.data.api_trigger_id === "responses_v1" || process.env.PRAYER_GENERATION_PROVIDER === "responses";
      // Candidate flags are not proof. Responses candidates must pass the server image check below.
      const candidate = requiresVision ? { ...input.result, songs: input.result.songs.map((song) => ({ ...song, scoreImageVerified: true })) } : input.result;
      let prepared;
      try {
        prepared = prepareGeneratedPrayer(original, candidate, { createdAt: task.data.created_at, requestToken: input.requestToken });
      } catch (error) {
        // Validation details are fixed schema/domain messages; no payload or credential is returned.
        const message = error instanceof Error && !error.message.includes(input.requestToken)
          ? error.message.slice(0, 300) : "자료의 날짜, 찬양 순서와 링크를 확인해주세요.";
        return failure(message);
      }
      if (requiresVision && task.data.status !== "completed") {
        if (!config || config.provider !== "responses") return failure();
        let verified = false;
        try { verified = await verifyPrayerScoreImages(config, prepared.result, fetch,
          createPrayerUsageObserver(client, input.requestId, input.requestToken)); } catch { /* Fail closed on image/network/refusal errors. */ }
        if (!verified) {
          const draft = await preparePartialPrayer(original, input.result,
            (song) => verifyPrayerScoreImages(config, { songs: [song] }, fetch, createPrayerUsageObserver(client, input.requestId, input.requestToken)),
            { createdAt: task.data.created_at, requestToken: input.requestToken });
          const saved = await client.rpc("save_prayer_generation_draft", { p_id: input.requestId, p_token: input.requestToken, p_draft: draft });
          return saved.error || !saved.data ? failure() : savedResult(saved.data);
        }
      }
      // This RPC rechecks cancellation, expiry and registration after the external image check.
      const saved = await client.rpc("complete_prayer_generation_request", {
        p_id: input.requestId, p_token: input.requestToken, p_entries: prepared.entries, p_result: prepared.result,
      });
      if (saved.error || !saved.data) return failure();
      const result = savedResult(saved.data);
      if (result.status === "completed" && invalidate) revalidatePath("/prayer");
      return result;
    } catch { return failure(); }
  },
}; }

export const prayerGenerationToolHandlers = createPrayerGenerationHandlers();
