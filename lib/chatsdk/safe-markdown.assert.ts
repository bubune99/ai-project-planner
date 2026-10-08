/**
 * Assertions for lib/chatsdk/safe-markdown.ts — renders hostile model output
 * through Streamdown with the default plugins (to prove the hole) and with
 * safeRehypePlugins (to prove it is closed).
 *   npx -y tsx@4.23.15 lib/chatsdk/safe-markdown.assert.ts
 */

import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { Streamdown } from "streamdown"
import { safeRehypePlugins, rawHtmlToText } from "./safe-markdown"

let pass = 0
let fail = 0
function ok(cond: boolean, what: string, detail = "") {
  if (cond) pass++
  else {
    fail++
    console.error(`FAIL ${what}${detail ? `\n  ${detail}` : ""}`)
  }
}

const hostile = [
  "Hello **world**",
  "",
  `<iframe srcdoc="<script>parent.pwned=1</script>"></iframe>`,
  "",
  `<img src="x" onerror="alert(1)">`,
  "",
  `<form action="javascript:alert(1)"><button>go</button></form>`,
  "",
  "[js link](javascript:alert(1)) [data link](data:text/html,boom) [custom](ms-msdt:/id) [good](https://example.com/a)",
  "",
  "![pixel](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=) ![ok](https://example.com/i.png)",
  "",
  "Inline <b>bold html</b> and math $$x^2$$",
].join("\n")

const unsafe = renderToString(createElement(Streamdown, { mode: "static" }, hostile))
const safe = renderToString(createElement(Streamdown, { mode: "static", rehypePlugins: safeRehypePlugins }, hostile))

// mode "static" renders synchronously (streaming mode fills blocks in an
// effect, so renderToString would be empty); the plugin pipeline is identical.

// Baseline: proves the lead (defaults render raw HTML).
ok(/<iframe[^>]*srcDoc|<iframe[^>]*srcdoc/i.test(unsafe), "baseline: defaults render <iframe srcdoc>", unsafe.slice(0, 400))

// Fixed.
ok(!/<iframe/i.test(safe), "safe: no <iframe> element")
ok(!/<form/i.test(safe), "safe: no <form> element")
ok(!/<img[^>]*src="x"/i.test(safe), "safe: no raw <img src=x>")
ok(!/<b>bold html<\/b>/i.test(safe), "safe: inline raw <b> not rendered as element")
ok(safe.includes("&lt;iframe"), "safe: raw HTML shown as escaped text")
ok(!/href="javascript:/i.test(safe), "safe: no javascript: href")
ok(!/href="data:/i.test(safe), "safe: no data: href")
ok(!/href="ms-msdt:/i.test(safe), "safe: custom protocol link blocked")
ok(!/src="data:/i.test(safe), "safe: data: image blocked")
ok(safe.includes('href="https://example.com/a"'), "safe: https link kept")
ok(safe.includes('src="https://example.com/i.png"'), "safe: https image kept")
ok(/data-streamdown="strong">world</.test(safe), "safe: markdown still renders", safe.slice(0, 600))
ok(/katex/.test(safe), "safe: math still renders")

// Unit: rawHtmlToText.
const tree = { type: "root", children: [{ type: "element", children: [{ type: "raw", value: "<x>" }] }] }
rawHtmlToText(tree as never)
ok(JSON.stringify(tree).includes('"type":"text","value":"<x>"'), "rawHtmlToText converts nested raw")

console.log(`safe-markdown.assert: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
