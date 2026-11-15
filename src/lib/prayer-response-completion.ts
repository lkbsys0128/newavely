import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./supabase/env";
import { createPrayerRequestToken, getPrayerAgentConfig } from "./prayer-agent-server";
import { createPrayerGenerationHandlers } from "./prayer-generation-callback";
import { prepareGeneratedPrayer, type PrayerGenerationInput } from "./prayer-generation";
import { continuePrayerResponse, getPrayerResponse } from "./prayer-responses-client";
import { createPrayerUsageObserver } from "./prayer-usage";

/** Returns true only when no more work is needed. No provider payload or capability is returned. */
export async function completePrayerResponse(requestId: string, input: PrayerGenerationInput, timedOut = false) {
  const config = getPrayerAgentConfig();
  if (!config || config.provider !== "responses") return true;
  const requestToken = createPrayerRequestToken(config.signingSecret, requestId, input);
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const task = await client.rpc("get_prayer_generation_task", { p_id: requestId, p_token: requestToken });
  // Revoked registration, expiry and cancellation are checked before any paid external work.
  if (task.error?.code === "P0001") return true;
  if (task.error || !task.data) throw new Error("prayer-task-unavailable");
  if (!["queued", "running"].includes(task.data.status) || task.data.api_trigger_id !== config.triggerId) return true;
  const handlers = createPrayerGenerationHandlers(false);
  const report = async (status: "needs_input" | "failed" | "running", message: string) => {
    const result = await handlers.report({ requestId, requestToken, status, message });
    if (result.isError) throw new Error("prayer-status-unavailable");
    return status !== "running";
  };
  if (timedOut) return report("failed", "생성 제한 시간을 초과했습니다. 자료를 확인한 뒤 다시 요청해주세요.");
  const claim = await client.rpc("claim_prayer_response_result", { p_id: requestId, p_token: requestToken });
  if (claim.error) throw new Error("prayer-result-claim-unavailable");
  if (claim.data?.state === "done") return true;
  if (claim.data?.state !== "claimed") return false;
  const response = await getPrayerResponse(config, claim.data.run_id, requestId, fetch,
    createPrayerUsageObserver(client, requestId, requestToken));
  if (response.status === "tools_required") {
    const previousId = claim.data.run_id;
    const reserved = await client.rpc("reserve_prayer_research_step", {
      p_id: requestId, p_token: requestToken, p_previous_response_id: previousId,
    });
    if (reserved.error?.code === "P0002") return report("needs_input", "자료 확인 횟수 한도에 도달했습니다. 확인되지 않은 자료를 저장하지 않았습니다. [research_limit]");
    if (reserved.error) throw new Error("prayer-research-reservation-unavailable");
    if (!reserved.data) return false;
    let nextId: string;
    try { nextId = await continuePrayerResponse(config, previousId, requestId, response.calls); }
    catch {
      return report("failed", "자료 확인 후 AI 연결을 이어가지 못했습니다. 중복 실행 방지를 위해 자동 재요청하지 않았습니다. [research_continuation]");
    }
    // Replaying this commit is safe, but replaying the paid POST above is not.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const committed = await client.rpc("commit_prayer_research_step", {
          p_id: requestId, p_token: requestToken, p_previous_response_id: previousId, p_response_id: nextId,
        });
        if (!committed.error) return false;
        if (committed.error.code === "P0001") return true;
      } catch { /* Only retry the idempotent DB commit, never the paid POST. */ }
    }
    throw new Error("prayer-research-commit-unconfirmed");
  }
  if (response.status === "failed") {
    const messages = {
      output_limit: "AI 응답이 출력 한도에 도달해 중단됐습니다. 기도회는 저장되지 않았습니다. 관리자에게 알려주세요.",
      content_filter: "AI 응답이 안전 정책에 따라 중단됐습니다. 기도회는 저장되지 않았습니다.",
      cancelled: "AI 생성 작업이 취소됐습니다. 기도회는 저장되지 않았습니다.",
      provider_error: "AI 서비스에서 생성 작업을 완료하지 못했습니다. 기도회는 저장되지 않았습니다. 관리자에게 알려주세요.",
    };
    return report("failed", messages[response.reason ?? "provider_error"]);
  }
  if (response.status === "needs_input") return report("needs_input", response.message ?? "찬양 또는 말씀 자료를 확인하지 못했습니다. 관리자에게 알려주세요.");
  if (response.status !== "completed") return report("running", "찬양과 말씀 자료를 확인하고 있습니다.");
  try {
    prepareGeneratedPrayer(input, { ...response.result,
      songs: response.result.songs.map((song) => ({ ...song, scoreImageVerified: true })) },
    { createdAt: task.data.created_at, requestToken });
  } catch {
    return report("needs_input", "자료의 날짜, 찬양 순서 또는 링크가 요청과 일치하지 않습니다. 입력을 확인해주세요.");
  }
  // Shared server validation loads actual score images and uses the existing audited save RPC.
  const result = await handlers.submit({ requestId, requestToken, result: response.result });
  if (result.isError) throw new Error("prayer-save-not-confirmed");
  return true;
}
