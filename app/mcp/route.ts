/**
 * MCP Server Route for AI Project Planner
 * Exposes project context and tools to AI agents via Model Context Protocol
 *
 * Authentication: Per-user API keys (aipp_*) with strict data isolation
 * Each user can only access their own projects, documents, and data
 *
 * Following the pattern from vercel-labs/mcp-for-next.js
 */

import { createMcpHandler } from "mcp-handler"
import { NextRequest } from "next/server"
import { validateMcpApiKey, runWithMcpContext, type McpContext } from "@/lib/auth/mcp-context"
import { registerPlannerTools } from "@/lib/mcp/planner-tools"
import { checkRateLimit, HOUR_MS } from "@/lib/rate-limit"
import { collectTools } from "@/lib/agents/tool-bridge"
import { callProblems, problemText } from "@/lib/mcp/strict-args"

/** MCP requests per API key per minute. */
const MCP_REQUESTS_PER_MINUTE = 120
/** catalog_scan_now calls per API key per hour (each scan walks a repo). */
const CATALOG_SCANS_PER_HOUR = 5

/** Tool names a JSON-RPC body calls (single or batch). Never throws. */
async function calledTools(request: NextRequest): Promise<string[]> {
  if (request.method !== "POST") return []
  try {
    const body = await request.clone().json()
    const msgs = Array.isArray(body) ? body : [body]
    return msgs
      .filter((m) => m && m.method === "tools/call" && typeof m.params?.name === "string")
      .map((m) => m.params.name as string)
  } catch {
    return []
  }
}

/** Each tool's field names, built once per instance from the same registration the endpoint serves. */
let fieldLists: Promise<Map<string, string[]>> | null = null
function toolFields(): Promise<Map<string, string[]>> {
  fieldLists ??= collectTools(registerPlannerTools).then((tools) => new Map([...tools.values()].map((t) => [t.name, Object.keys(t.shape)])))
  return fieldLists
}

/**
 * A call naming a field its tool does not take is answered with an error instead of running with that field
 * dropped (lib/mcp/strict-args.ts). A batch with one such call runs none of its calls. Null when every call is fine.
 */
async function refuseUnknownFields(request: NextRequest): Promise<Response | null> {
  if (request.method !== "POST") return null
  let body: unknown
  try { body = await request.clone().json() } catch { return null }
  const fields = await toolFields()
  const problems = callProblems(body, (t) => fields.get(t))
  if (!problems.length) return null
  const msgs = Array.isArray(body) ? body : [body]
  const answer = (id: unknown, text: string) => ({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } })
  const replies = msgs
    .filter((m) => m && typeof m === "object" && "id" in m)
    .map((m) => {
      const p = problems.find((x) => x.id === (m as { id: unknown }).id)
      return answer((m as { id: unknown }).id, p ? problemText(p) : "Not run: another call in this batch named a field its tool does not take.")
    })
  return new Response(JSON.stringify(Array.isArray(body) ? replies : replies[0]), { status: 200, headers: { "Content-Type": "application/json" } })
}

function tooManyRequests(message: string) {
  return new Response(JSON.stringify({ error: "Too Many Requests", message }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60" },
  })
}

/**
 * Authenticate MCP request and return user context
 *
 * Supports:
 * - Authorization: Bearer aipp_xxxxx
 * - X-API-Key: aipp_xxxxx
 */
async function authenticateRequest(
  request: NextRequest
): Promise<McpContext | null> {
  // Check Authorization header first (preferred)
  const authHeader = request.headers.get("authorization")
  if (authHeader) {
    const context = await validateMcpApiKey(authHeader)
    if (context) return context
  }

  // Fall back to X-API-Key header
  const xApiKey = request.headers.get("x-api-key")
  if (xApiKey) {
    const context = await validateMcpApiKey(xApiKey)
    if (context) return context
  }

  // In development only: allow requests if no key provided but env var is set
  // This maintains backward compatibility during development
  if (process.env.NODE_ENV === "development") {
    const devKey = process.env.MCP_API_KEY
    if (devKey && (authHeader === `Bearer ${devKey}` || xApiKey === devKey)) {
      // Dev mode with old shared key - return system user context
      console.warn(
        "MCP: Using deprecated MCP_API_KEY - please switch to per-user API keys"
      )
      return {
        userId: "00000000-0000-0000-0000-000000000001", // System user
        apiKeyId: "dev-key",
        scopes: ["read", "write"],
      }
    }
  }

  return null
}

// Tools live in lib/mcp/planner-tools.ts so the in-app agents can register
// the same set (see lib/agents/tool-bridge.ts).
const handler = createMcpHandler(
  registerPlannerTools,
  {},
  {
    // Streamable-HTTP transport (what Claude Code's "type":"http" client uses)
    // is STATELESS by design here: mcp-handler >=1.1.0 builds a fresh server +
    // transport per POST, so each JSON-RPC call is self-contained and survives
    // Vercel's serverless instance churn. (mcp-handler 1.0.6 reused one module-
    // level transport across invocations -> initialize 200 then 500 on every
    // follow-up. The real fix was the 1.0.6 -> 1.1.0 upgrade, NOT redisUrl:
    // redisUrl is only consumed by the legacy /sse + /message transport.)
    // We intentionally do NOT set sessionIdGenerator: the streamable path has
    // no Redis-backed session store, so advertising a session id would be a
    // lie that breaks strict clients on their second request.
    // The legacy /sse + /message transport needed a Redis store; the Upstash store was dropped on 2026-11-17
    // (owner's call). Clients use the streamable HTTP transport at /mcp, so SSE is switched off rather than broken.
    disableSse: true,
    basePath: "",
    verboseLogs: true,
    maxDuration: 60,
  }
)

/**
 * Handle MCP request with authentication
 */
async function handleWithAuth(request: NextRequest) {
  const context = await authenticateRequest(request)

  if (!context) {
    // Emit RFC 9728 WWW-Authenticate so OAuth-capable MCP clients (Claude
    // Desktop's "Add custom connector") can discover the authorization server
    // and start the OAuth 2.1 + PKCE flow. Non-OAuth clients still read the body.
    let resourceMetadata =
      "https://v0-ai-project-planner-eight.vercel.app/.well-known/oauth-protected-resource/mcp"
    try {
      resourceMetadata = `${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp`
    } catch {
      /* fall back to canonical prod origin */
    }
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message:
          "Invalid or missing API key. Use Authorization: Bearer aipp_xxxxx header.",
        hint: "Generate an API key from your dashboard settings, or connect via OAuth.",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
        },
      }
    )
  }

  // Per-key limits (Postgres counters; refuse when they cannot be read).
  if (!(await checkRateLimit(`mcp:${context.apiKeyId}`, MCP_REQUESTS_PER_MINUTE, 60_000))) {
    return tooManyRequests(`Rate limit: ${MCP_REQUESTS_PER_MINUTE} requests per minute per API key.`)
  }
  const scans = (await calledTools(request)).filter((t) => t === "catalog_scan_now").length
  for (let i = 0; i < scans; i++) {
    if (!(await checkRateLimit(`mcp-scan:${context.apiKeyId}`, CATALOG_SCANS_PER_HOUR, HOUR_MS))) {
      return tooManyRequests(`Rate limit: catalog_scan_now is limited to ${CATALOG_SCANS_PER_HOUR} per hour per API key.`)
    }
  }

  const refused = await refuseUnknownFields(request)
  if (refused) return refused

  // Run handler with MCP context
  return runWithMcpContext(context, () => handler(request))
}

// Export handlers with authentication wrapper
export const GET = handleWithAuth
export const POST = handleWithAuth
export const DELETE = handleWithAuth
