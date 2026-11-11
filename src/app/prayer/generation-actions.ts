"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canManagePrayer } from "@/lib/prayer-access";
import { createClient } from "@/lib/supabase/server";
import { buildPrayerAgentInput, createPrayerRequestToken, getPrayerAgentConfig, hashPrayerRequestToken } from "@/lib/prayer-agent-server";
import { isGenerationPending, startPrayerGenerationSchema, toGenerationJob, type GenerationJob, type PrayerGenerationInput } from "@/lib/prayer-generation";
import { AgentDispatchError, getWorkspaceAgentRun, triggerWorkspaceAgent } from "@/lib/workspace-agent-client";

type ActionResult = { ok: boolean; message: string; job?: GenerationJob; jobs?: GenerationJob[]; uncertain?: boolean };
class GenerationAccessError extends Error {}

async function generationClient() {
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new GenerationAccessError("로그인이 필요합니다. 입력한 내용은 그대로 유지됩니다.");
  const { data: member, error } = await client.from("members").select("id, status").eq("auth_user_id", user.id).maybeSingle();
  if (error || !canManagePrayer(member)) throw new GenerationAccessError("멤버 등록 승인 후 기도회를 생성할 수 있습니다.");
  return client;
}

function databaseMessage(error: { code?: string; message?: string } | null, fallback: string) {
  return error?.code === "P0001" && error.message ? error.message.slice(0, 300) : fallback;
}

export async function startPrayerGeneration(value: unknown): Promise<ActionResult> {
  const parsed = startPrayerGenerationSchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: "날짜와 앞·뒤 찬양 두 곡씩을 확인해주세요." };
  const config = getPrayerAgentConfig();
  if (!config) return { ok: false, message: "자동 생성 연결을 준비 중입니다. 현재는 직접 기도회를 작성할 수 있습니다." };
  const { requestId, ...input } = parsed.data;
  let job: GenerationJob | undefined;
  let creating = false;
  try {
    const client = await generationClient();
    const token = createPrayerRequestToken(config.signingSecret, requestId, input);
    creating = true;
    const created = await client.rpc("create_prayer_generation_request", {
      p_id: requestId, p_input: input, p_token_hash: hashPrayerRequestToken(token),
    });
    if (created.error) {
      const knownRejection = ["P0001", "23505", "42501", "PGRST202", "22P02"].includes(created.error.code);
      return { ok: false, message: databaseMessage(created.error, knownRejection
        ? "자동 생성 요청을 접수하지 못했습니다. 잠시 후 다시 확인해주세요."
        : "접수 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요."), ...(!knownRejection ? { uncertain: true } : {}) };
    }
    job = toGenerationJob(created.data);
    if (!isGenerationPending(job.status) || created.data?.dispatched === true) return { ok: true, message: job.message, job };
    try {
      const dispatched = await triggerWorkspaceAgent(config, { requestId, input: buildPrayerAgentInput(config, requestId, token, input) });
      const marked = await client.rpc("mark_prayer_generation_dispatched", {
        p_id: requestId, p_api_trigger_id: config.triggerId, p_run_id: dispatched.runId, p_conversation_url: dispatched.conversationUrl,
      });
      if (marked.error || !marked.data) throw new AgentDispatchError(false);
      job = toGenerationJob(marked.data);
      return { ok: true, message: isGenerationPending(job.status)
        ? "기도회를 생성하고 있습니다. 이 화면을 닫아도 작업은 계속됩니다." : job.message, job };
    } catch (error) {
      if (error instanceof AgentDispatchError && error.definitive) {
        const failed = await client.rpc("fail_prayer_generation_dispatch", {
          p_id: requestId, p_message: "생성 연결을 사용할 수 없습니다. 운영 담당자가 연결 상태를 확인해야 합니다.",
        });
        if (!failed.error && failed.data) job = toGenerationJob(failed.data);
        return { ok: job.status === "completed", message: job.message || "생성 연결을 확인해주세요.", job };
      }
      // A timeout can happen after acceptance. Retry this same event, never create a second job.
      return { ok: true, message: "요청 접수를 확인 중입니다. 잠시 후 ‘요청 다시 확인’을 눌러주세요.", job, uncertain: true };
    }
  } catch (error) {
    return { ok: false, message: error instanceof GenerationAccessError ? error.message
      : "연결을 확인해주세요. 입력한 내용은 그대로 유지됩니다.", ...(job ? { job } : {}), ...(creating && !job ? { uncertain: true } : {}) };
  }
}

export async function getPrayerGenerationJob(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "생성 요청을 확인해주세요." };
  try {
    const client = await generationClient();
    const read = await client.rpc("get_prayer_generation_request", { p_id: id });
    if (read.error || !read.data) return { ok: false, message: "생성 요청을 불러오지 못했습니다." };
    let job = toGenerationJob(read.data);
    const config = getPrayerAgentConfig();
    if (config && isGenerationPending(job.status)) {
      const input: PrayerGenerationInput = { eventDate: job.eventDate, beforeSongs: [job.beforeSongs[0], job.beforeSongs[1]], afterSongs: [job.afterSongs[0], job.afterSongs[1]] };
      const requestToken = createPrayerRequestToken(config.signingSecret, id, input);
      const claim = await client.rpc("claim_prayer_generation_poll", { p_id: id, p_token: requestToken });
      // Provider metadata is never an authority to use this server credential on another channel.
      if (!claim.error && claim.data?.api_trigger_id === config.triggerId && claim.data?.run_id) {
        try {
          const state = await getWorkspaceAgentRun(config, claim.data.run_id);
          if (state === "failed" || state === "completed") {
            await client.rpc("fail_prayer_generation_dispatch", { p_id: id, p_message: state === "completed"
              ? "에이전트 작업이 끝났지만 기도회가 저장되지 않았습니다. 연결과 자료를 확인한 뒤 다시 요청해주세요."
              : "기도회 생성 중 문제가 발생했습니다. 입력을 확인한 뒤 다시 요청해주세요." });
          } else if (state === "suspended") {
            await client.rpc("report_prayer_generation_status", { p_id: id,
              p_token: requestToken, p_status: "running",
              p_message: "에이전트가 추가 확인을 기다리고 있습니다. 운영 담당자가 작업 상태를 확인해야 합니다." });
          }
        } catch { /* Status transport failures do not revoke a live job or overwrite a successful save. */ }
        const latest = await client.rpc("get_prayer_generation_request", { p_id: id });
        if (!latest.error && latest.data) job = toGenerationJob(latest.data);
      }
    }
    if (job.status === "completed") revalidatePath("/prayer");
    return { ok: true, message: job.message, job };
  } catch (error) {
    return { ok: false, message: error instanceof GenerationAccessError ? error.message : "진행 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요." };
  }
}

export async function listOwnPrayerGenerationJobs(): Promise<ActionResult> {
  try {
    const client = await generationClient();
    const { data, error } = await client.rpc("list_prayer_generation_requests");
    if (error || !Array.isArray(data)) return { ok: false, message: "생성 요청 목록을 불러오지 못했습니다." };
    return { ok: true, message: "", jobs: data.map(toGenerationJob) };
  } catch (error) {
    return { ok: false, message: error instanceof GenerationAccessError ? error.message : "생성 요청 목록을 불러오지 못했습니다." };
  }
}

export async function cancelPrayerGeneration(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "생성 요청을 확인해주세요." };
  try {
    const client = await generationClient();
    const { data, error } = await client.rpc("cancel_prayer_generation_request", { p_id: id });
    if (error || !data) return { ok: false, message: databaseMessage(error, "요청 취소 여부를 확인하지 못했습니다. 다시 확인해주세요.") };
    const job = toGenerationJob(data);
    return { ok: true, message: job.message, job };
  } catch (error) {
    return { ok: false, message: error instanceof GenerationAccessError ? error.message : "요청 취소 여부를 확인하지 못했습니다. 다시 확인해주세요." };
  }
}
