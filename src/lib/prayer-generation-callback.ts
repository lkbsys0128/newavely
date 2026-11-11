import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { prayerGenerationInputSchema, prepareGeneratedPrayer, toGenerationJob } from "./prayer-generation";
import type { GenerationToolHandlers, GenerationToolResponse } from "./prayer-generation-mcp";

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

export const prayerGenerationToolHandlers: GenerationToolHandlers = {
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
      const original = prayerGenerationInputSchema.parse(task.data.input);
      let prepared;
      try {
        prepared = prepareGeneratedPrayer(original, input.result, { createdAt: task.data.created_at, requestToken: input.requestToken });
      } catch (error) {
        // Validation details are fixed schema/domain messages; no payload or credential is returned.
        const message = error instanceof Error && !error.message.includes(input.requestToken)
          ? error.message.slice(0, 300) : "자료의 날짜, 찬양 순서와 링크를 확인해주세요.";
        return failure(message);
      }
      const saved = await client.rpc("complete_prayer_generation_request", {
        p_id: input.requestId, p_token: input.requestToken, p_entries: prepared.entries, p_result: prepared.result,
      });
      if (saved.error || !saved.data) return failure();
      const result = savedResult(saved.data);
      if (result.status === "completed") revalidatePath("/prayer");
      return result;
    } catch { return failure(); }
  },
};
