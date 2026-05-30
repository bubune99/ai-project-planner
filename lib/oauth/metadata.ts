/**
 * Canonical issuer / endpoint URLs for the OAuth 2.1 authorization server.
 *
 * Resolution order for the public origin:
 *  1. OAUTH_ISSUER env (explicit override, no trailing slash)
 *  2. NEXT_PUBLIC_APP_URL env
 *  3. the incoming request's origin (so preview deploys self-describe correctly)
 *
 * Keeping this in one place means the discovery docs, the authorize redirect,
 * and the token issuer all agree — a mismatch here is the #1 cause of MCP
 * clients silently failing the OAuth handshake.
 */

const DEFAULT_PROD_ORIGIN = "https://v0-ai-project-planner-eight.vercel.app"

export function resolveOrigin(requestUrl?: string): string {
  const fromEnv =
    process.env.OAUTH_ISSUER ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_PROD_ORIGIN
}

export interface AuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint: string
  scopes_supported: string[]
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported: string[]
  token_endpoint_auth_methods_supported: string[]
}

export function authServerMetadata(origin: string): AuthServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: ["read", "write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  }
}

export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  bearer_methods_supported: string[]
}

export function protectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"],
  }
}
