/**
 * Assertions for lib/oauth/redirect-uri.ts and lib/oauth/scope.ts.
 *   npx -y tsx@4.23.15 lib/oauth/oauth-policy.assert.ts
 */

import { isSafeRedirectUri } from "./redirect-uri"
import { parseScope, formatScope, DEFAULT_SCOPES } from "./scope"

let pass = 0
let fail = 0
function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) pass++
  else {
    fail++
    console.error(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`)
  }
}

/* ------------------------------------------------------------ redirect uri */
const allowed = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://example.com/cb?x=1",
  "http://localhost:6274/oauth/callback",
  "http://127.0.0.1:33418/callback",
  "http://[::1]:8080/cb",
]
for (const u of allowed) eq(isSafeRedirectUri(u), true, `allow ${u}`)

const denied: unknown[] = [
  "javascript://claude.ai/%0Awindow.name=document.domain//",
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  " javascript:alert(1)",
  "javascript:alert(1) ",
  "java\tscript:alert(1)",
  "\u0001https://claude.ai/cb",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "blob:https://claude.ai/uuid",
  "claude://callback",
  "cursor://anysphere.cursor-retrieval/oauth/callback",
  "http://example.com/cb",
  "http://localhost.evil.com/cb",
  "http://127.0.0.1.nip.io/cb",
  "https://user:pass@example.com/cb",
  "/relative/cb",
  "",
  null,
  undefined,
  42,
]
for (const u of denied) eq(isSafeRedirectUri(u), false, `deny ${JSON.stringify(u)}`)

/* ------------------------------------------------------------------- scope */
eq(parseScope(undefined), ["read", "write"], "absent -> default")
eq(parseScope(null), ["read", "write"], "null -> default")
eq(parseScope(""), ["read", "write"], "empty -> default")
eq(parseScope(" "), ["read", "write"], "space -> default (display == grant)")
eq(parseScope("\t \n"), ["read", "write"], "whitespace -> default")
eq(parseScope("read"), ["read"], "read only")
eq(parseScope("  read  "), ["read"], "read padded")
eq(parseScope("write read"), ["read", "write"], "order normalised")
eq(parseScope("read read"), ["read"], "dedupe")
eq(parseScope("read admin"), ["read"], "unknown dropped, read kept")
eq(parseScope("admin"), ["read", "write"], "only unknown -> default")
eq(parseScope("READ"), ["read", "write"], "case-sensitive: READ is unknown -> default")
eq(formatScope(parseScope("write read")), "read write", "format")
eq(DEFAULT_SCOPES, ["read", "write"], "default unchanged")
// Round trip: what the consent page stores is re-parsed identically at /token.
for (const raw of [undefined, " ", "read", "write", "read write", "admin read"]) {
  const shown = parseScope(raw)
  eq(parseScope(formatScope(shown)), shown, `round trip ${JSON.stringify(raw)}`)
}

console.log(`oauth-policy.assert: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
