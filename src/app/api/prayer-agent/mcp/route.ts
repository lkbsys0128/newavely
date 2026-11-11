import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPrayerGenerationMcpServer } from "@/lib/prayer-generation-mcp";
import { prayerGenerationToolHandlers } from "@/lib/prayer-generation-callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  // Browser origins are checked independently of the per-request capability authorization.
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.PRAYER_AGENT_APP_URL;
  if (origin) {
    let allowed = false;
    try { allowed = Boolean(configuredOrigin && origin === new URL(configuredOrigin).origin); } catch { /* fail closed */ }
    if (!allowed) return new Response("Origin not allowed", { status: 403 });
  }
  const server = createPrayerGenerationMcpServer(prayerGenerationToolHandlers);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 64 * 1024,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally { await server.close(); }
}

// Stateless request/response only; no long-lived event stream or session to delete.
export async function GET() { return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } }); }
export async function DELETE() { return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } }); }
