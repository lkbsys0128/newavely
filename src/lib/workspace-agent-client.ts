import { z } from "zod";

const apiRoot = "https://api.chatgpt.com/v1/workspace_agents";
const triggerIdSchema = z.string().regex(/^agtch_[A-Za-z0-9_-]{1,160}$/);
const runIdSchema = z.string().regex(/^apirun_[A-Za-z0-9_-]{1,160}$/);
const triggerResponseSchema = z.object({
  conversation_url: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.origin === "https://chatgpt.com" && url.pathname.startsWith("/c/");
  }),
  agent_trigger_run_id: runIdSchema.optional(),
});
const runResponseSchema = z.object({ status: z.enum(["queued", "in_progress", "suspended", "completed", "failed"]) });
export type WorkspaceAgentRunStatus = z.infer<typeof runResponseSchema>["status"];

export class AgentDispatchError extends Error {
  constructor(public readonly definitive: boolean) {
    super(definitive ? "agent-dispatch-rejected" : "agent-dispatch-uncertain");
    this.name = "AgentDispatchError";
  }
}

export async function triggerWorkspaceAgent(
  config: { triggerId: string; accessToken: string },
  event: { requestId: string; input: string },
  request: typeof fetch = fetch,
) {
  triggerIdSchema.parse(config.triggerId);
  z.string().uuid().parse(event.requestId);
  let response: Response;
  try {
    response = await request(`${apiRoot}/${config.triggerId}/trigger`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json",
        "Idempotency-Key": `prayer-generation:${event.requestId}`, "OpenAI-Beta": "workspace_agent_runs=v1" },
      body: JSON.stringify({ conversation_key: `prayer-request:${event.requestId}`, input: event.input }),
    });
  } catch { throw new AgentDispatchError(false); }
  if (response.status !== 202) throw new AgentDispatchError([400, 401, 403, 404, 409, 422].includes(response.status));
  try {
    const payload = triggerResponseSchema.parse(await response.json());
    return { conversationUrl: payload.conversation_url, runId: payload.agent_trigger_run_id ?? null };
  } catch { throw new AgentDispatchError(false); }
}

export async function getWorkspaceAgentRun(
  config: { triggerId: string; accessToken: string }, runId: string, request: typeof fetch = fetch,
): Promise<WorkspaceAgentRunStatus> {
  triggerIdSchema.parse(config.triggerId);
  runIdSchema.parse(runId);
  const response = await request(`${apiRoot}/${config.triggerId}/runs/${runId}`, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${config.accessToken}`, Accept: "application/json", "OpenAI-Beta": "workspace_agent_runs=v1" },
  });
  if (!response.ok) throw new Error("agent-status-unavailable");
  return runResponseSchema.parse(await response.json()).status;
}
