import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generationCapabilitySchema, prayerGenerationResultSchema, type PrayerGenerationResult } from "./prayer-generation";

export type GenerationToolResponse = { status: string; message: string; meetingId?: string; meetingUrl?: string; isError?: boolean };
export type GenerationToolHandlers = {
  report: (input: { requestId: string; requestToken: string; status: "running" | "needs_input" | "failed"; message: string }) => Promise<GenerationToolResponse>;
  submit: (input: { requestId: string; requestToken: string; result: PrayerGenerationResult }) => Promise<GenerationToolResponse>;
};

function toolResult(result: GenerationToolResponse) {
  const { isError, ...structuredContent } = result;
  return { content: [{ type: "text" as const, text: result.message }], structuredContent, ...(isError ? { isError: true } : {}) };
}

export function createPrayerGenerationMcpServer(handlers: GenerationToolHandlers) {
  const server = new McpServer({ name: "newavely-prayer-generation", version: "1.0.0" }, {
    instructions: "요청별 requestId/requestToken이 있어야 상태 보고·결과 제출이 가능합니다. 토큰은 이 서버 도구의 인증 인자에만 넣으세요. 다른 요청 조회, 날짜 변경, 기존 기도회 수정은 지원하지 않습니다. 검증이 끝난 네 곡과 해당 날짜 말씀 자료만 제출하세요.",
  });
  const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };
  const outputSchema = z.object({ status: z.string(), message: z.string(), meetingId: z.string().optional(), meetingUrl: z.string().optional() });
  server.registerTool("report_prayer_generation_status", {
    title: "기도회 생성 상태 보고",
    description: "Use for a supplied Newavely request only. Report running before research, needs_input for unverified/ambiguous required material, or failed. Validate request-specific capability on every call. Never put the token in message.",
    inputSchema: z.object({ ...generationCapabilitySchema, status: z.enum(["running", "needs_input", "failed"]), message: z.string().trim().min(1).max(300) }).strict(),
    outputSchema, annotations,
  }, async (input) => toolResult(await handlers.report(input)));
  server.registerTool("submit_prayer_generation_result", {
    title: "검증한 기도회 저장",
    description: "Use after verifying the requested four songs, Bugs lyric pages, loaded score images, and exact-date official devotional metadata. Supply requestedTitle in original order and UTC ISO verifiedAt. The server builds and saves the fixed program; it excludes devotional source URLs. This capability creates only the original request's date and never overwrites an existing meeting.",
    inputSchema: z.object({ ...generationCapabilitySchema, result: prayerGenerationResultSchema }).strict(),
    outputSchema, annotations,
  }, async (input) => toolResult(await handlers.submit(input)));
  return server;
}
