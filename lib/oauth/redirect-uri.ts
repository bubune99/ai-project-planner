/**
 * Redirect-URI scheme policy for the OAuth authorization server.
 *
 * The authorize endpoint and its server actions hand the redirect_uri to
 * Next's redirect(), which the client performs with location.assign(). A
 * registered `javascript:` (or `data:`) URI would therefore execute script in
 * the planner origin with the signed-in user's session. Exact-match against
 * the registered list is not enough on its own because registration is open.
 *
 * Policy: https anywhere; http only for loopback hosts (RFC 8252 §7.3).
 * Every other scheme — javascript:, data:, vbscript:, file:, custom app
 * schemes — is rejected.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

export function isSafeRedirectUri(uri: unknown): boolean {
  if (typeof uri !== "string" || uri.length === 0) return false
  // URL() trims leading/trailing C0 controls and spaces; reject them outright
  // so the stored string is exactly what gets parsed.
  if (uri !== uri.trim() || /[\u0000-\u001f\u007f]/.test(uri)) return false
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.username || u.password) return false
  if (u.protocol === "https:") return u.hostname.length > 0
  if (u.protocol === "http:") return LOOPBACK_HOSTS.has(u.hostname)
  return false
}
