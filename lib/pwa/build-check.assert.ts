/* Run: npx -y tsx@4.23.15 lib/pwa/build-check.assert.ts */
import { CHECK_EVERY_MS, MIN_GAP_MS, fullLoadFor, isStale, shouldAsk } from "./build-check"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}

// The case of 2026-11-16: the tab loaded build A, build B shipped.
eq(isStale("dpl_A", "dpl_B"), true, "a different live build is stale")
eq(isStale("dpl_A", "dpl_A"), false, "the same build is not")
eq(isStale("dpl_A", null), false, "a failed read never prompts")
eq(isStale("", "dpl_B"), false, "an unknown loaded build never prompts")
eq(isStale("dev", "dev"), false, "a local run never prompts")

eq(shouldAsk(null, 0, "timer"), true, "the first time, ask")
eq(shouldAsk(0, CHECK_EVERY_MS - 1, "timer"), false, "the timer waits its full interval")
eq(shouldAsk(0, CHECK_EVERY_MS, "timer"), true, "then asks")
eq(shouldAsk(0, MIN_GAP_MS - 1, "focus"), false, "focus flapping does not hammer the server")
eq(shouldAsk(0, MIN_GAP_MS, "focus"), true, "coming back after a while asks")

const plain = { button: 0, meta: false, ctrl: false, shift: false, alt: false }
const here = "https://planner.example/project/1?tab=tasks"
eq(fullLoadFor({ href: "/dashboard" }, here, plain), true, "an in-app link becomes a full load")
eq(fullLoadFor({ href: "https://elsewhere.example/" }, here, plain), false, "another site is left alone")
eq(fullLoadFor({ href: "/dashboard" }, here, { ...plain, ctrl: true }), false, "a ctrl-click (new tab) is left alone")
eq(fullLoadFor({ href: "/dashboard", target: "_blank" }, here, plain), false, "a new-tab link is left alone")
eq(fullLoadFor({ href: "#notes" }, here, plain), false, "a link within the same page is left alone")
eq(fullLoadFor({ href: "/file.pdf", download: true }, here, plain), false, "a download is left alone")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
