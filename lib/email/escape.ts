/**
 * HTML-escaping helpers for the string-built email templates.
 *
 * Every value interpolated into an email's HTML must pass through one of
 * these. Project names, inviter names and invite messages are user-controlled;
 * without escaping they inject markup into mail sent from the app's trusted
 * sender (content spoofing / phishing links).
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
}

/** Escape a value for an HTML text node or a quoted attribute value. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch])
}

/**
 * Return the URL only if it is an absolute http(s) URL, otherwise "#".
 * Use for href values, then escape the result: escapeHtml(safeHttpUrl(url)).
 */
export function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "#"
  try {
    const u = new URL(value.trim())
    if (u.protocol === "https:" || u.protocol === "http:") return u.href
  } catch {
    // fall through
  }
  return "#"
}
