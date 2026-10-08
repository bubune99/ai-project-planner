/**
 * Assertions for lib/email/escape.ts and the email templates that use it.
 *   npx -y tsx@4.23.15 lib/email/escape.assert.ts
 */

import { escapeHtml, safeHttpUrl } from "./escape"
import { getInvitationEmailHtml } from "./templates/invitation"
import { getCollaboratorJoinedEmailHtml } from "./templates/collaborator-joined"

let pass = 0
let fail = 0
function ok(cond: boolean, what: string) {
  if (cond) pass++
  else {
    fail++
    console.error(`FAIL ${what}`)
  }
}
function eq(a: unknown, b: unknown, what: string) {
  ok(a === b, `${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`)
}

/* -------------------------------------------------------------- escapeHtml */
eq(escapeHtml(`<script>alert(1)</script>`), "&lt;script&gt;alert(1)&lt;/script&gt;", "script tag")
eq(escapeHtml(`" onmouseover="x`), "&quot; onmouseover=&quot;x", "attr breakout dq")
eq(escapeHtml(`' onmouseover='x`), "&#39; onmouseover=&#39;x", "attr breakout sq")
eq(escapeHtml("a & b"), "a &amp; b", "ampersand")
eq(escapeHtml("&lt;"), "&amp;lt;", "double-escape is literal")
eq(escapeHtml("`x`"), "&#96;x&#96;", "backtick")
eq(escapeHtml(null), "", "null")
eq(escapeHtml(undefined), "", "undefined")
eq(escapeHtml(42), "42", "number")
eq(escapeHtml("Plain name"), "Plain name", "plain unchanged")

/* ------------------------------------------------------------- safeHttpUrl */
eq(safeHttpUrl("https://app.example.com/invite/abc"), "https://app.example.com/invite/abc", "https kept")
eq(safeHttpUrl("http://localhost:3000/invite/abc"), "http://localhost:3000/invite/abc", "http kept")
eq(safeHttpUrl("javascript:alert(1)"), "#", "javascript blocked")
eq(safeHttpUrl("JaVaScRiPt:alert(1)"), "#", "javascript mixed case blocked")
eq(safeHttpUrl(" javascript:alert(1)"), "#", "javascript leading space blocked")
eq(safeHttpUrl("java\tscript:alert(1)"), "#", "javascript with tab blocked")
eq(safeHttpUrl("data:text/html,<script>alert(1)</script>"), "#", "data blocked")
eq(safeHttpUrl("vbscript:msgbox(1)"), "#", "vbscript blocked")
eq(safeHttpUrl("/relative/path"), "#", "relative rejected")
eq(safeHttpUrl(""), "#", "empty")
eq(safeHttpUrl(undefined), "#", "undefined")
ok(!safeHttpUrl(`https://x.test/"><script>`).includes('"'), "quote in https url is percent-encoded")

/* --------------------------------------------------------------- templates */
const evil = `<b id="pwn">x</b><a href="https://evil.test">click</a>" onx="y`
const inv = getInvitationEmailHtml({
  inviteUrl: `javascript:alert(1)`,
  projectName: evil,
  inviterName: evil,
  role: "editor",
  message: evil,
  expiresAt: new Date("2026-10-10T00:00:00Z"),
})
ok(!inv.includes("<b id="), "invitation: no injected <b>")
ok(!inv.includes('<a href="https://evil.test"'), "invitation: no injected link")
ok(!inv.includes('href="javascript:'), "invitation: javascript: href removed")
ok(inv.includes("&lt;b id=&quot;pwn&quot;&gt;"), "invitation: markup shown escaped")
ok(inv.includes('<a href="#"'), "invitation: unsafe CTA href becomes #")

const inv2 = getInvitationEmailHtml({
  inviteUrl: "https://planner.example.com/invite/tok123",
  projectName: "Alpha",
  inviterName: "Ann",
  role: "viewer",
  expiresAt: new Date("2026-10-10T00:00:00Z"),
})
ok(inv2.includes('<a href="https://planner.example.com/invite/tok123"'), "invitation: good URL kept")
ok(inv2.includes("<strong>Ann</strong>") && inv2.includes("Viewer"), "invitation: plain values unchanged")
ok(!inv2.includes("Message from"), "invitation: no message block when message absent")

const joined = getCollaboratorJoinedEmailHtml({
  projectName: evil,
  projectUrl: "data:text/html,boom",
  collaboratorName: evil,
  collaboratorEmail: `a@b.c"><img src=x>`,
  role: "admin",
  recipientName: evil,
})
ok(!joined.includes("<b id="), "joined: no injected <b>")
ok(!joined.includes("<img src=x>"), "joined: no injected img")
ok(!joined.includes("data:text/html"), "joined: data: href removed")
ok(joined.includes('<a href="#"'), "joined: unsafe href becomes #")

console.log(`escape.assert: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
