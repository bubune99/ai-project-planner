/**
 * Unit tests for lib/text/decode-entities.ts
 *
 * Run with: npx tsx lib/text/decode-entities.test.ts
 *
 * Why these cases: six planner documents were stored with HTML entities in
 * their titles ("Northwind Product &amp; Business Thesis") because a client
 * encoded the payload before calling create_document. The decoders normalise
 * that on write — but a naive decode corrupts two things that must survive:
 * code samples that legitimately contain entities, and escaped angle brackets
 * that would become raw HTML in rendered markdown.
 */

import { decodeTitleEntities, decodeMarkdownAmpEntities } from "./decode-entities"

let passed = 0
let failed = 0
const failures: string[] = []

function eq(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    failures.push(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    failed++
  } else {
    passed++
  }
}

// ── Titles: plain text, rendered through React, so every basic entity decodes ──

eq(decodeTitleEntities("Northwind Product &amp; Business Thesis"), "Northwind Product & Business Thesis",
  "title: &amp; decodes (the real stored defect)")
eq(decodeTitleEntities("a &lt;b&gt; &quot;c&quot; &#39;d&#39; &#x27;e&#x27; &apos;f&apos;"), `a <b> "c" 'd' 'e' 'f'`,
  "title: lt/gt/quot/#39/#x27/apos all decode")
eq(decodeTitleEntities("Already & clean"), "Already & clean",
  "title: clean input is untouched")
eq(decodeTitleEntities("double &amp;amp; encoded"), "double &amp; encoded",
  "title: exactly ONE layer decodes — &amp;amp; becomes &amp;, not &")
eq(decodeTitleEntities("&amp;lt;tag&amp;gt;"), "&lt;tag&gt;",
  "title: single pass — decoded output is never re-scanned")
eq(decodeTitleEntities("R&D &copy; 2026"), "R&D &copy; 2026",
  "title: unknown/other entities are left alone")
eq(decodeTitleEntities(""), "", "title: empty string")

// ── Markdown content: only &amp;, only outside code ──

eq(decodeMarkdownAmpEntities("# Marketing &amp; Launch Plan\n\ncost &amp; pricing thesis"),
  "# Marketing & Launch Plan\n\ncost & pricing thesis",
  "content: prose &amp; decodes (the real stored defect)")

eq(decodeMarkdownAmpEntities("Use `&amp;` to escape"), "Use `&amp;` to escape",
  "content: inline code span is preserved verbatim")

eq(decodeMarkdownAmpEntities("a &amp; b `x &amp; y` c &amp; d"), "a & b `x &amp; y` c & d",
  "content: decodes around an inline code span but not inside it")

eq(decodeMarkdownAmpEntities("``code with ` and &amp;`` then &amp;"), "``code with ` and &amp;`` then &",
  "content: double-backtick span containing a single backtick is preserved")

const fenced = "Intro &amp; setup\n\n```html\n<p>Tom &amp; Jerry</p>\n```\n\nOutro &amp; done"
eq(decodeMarkdownAmpEntities(fenced), "Intro & setup\n\n```html\n<p>Tom &amp; Jerry</p>\n```\n\nOutro & done",
  "content: fenced ``` block is preserved verbatim")

const tilde = "a &amp; b\n~~~\nx &amp; y\n~~~\nc &amp; d"
eq(decodeMarkdownAmpEntities(tilde), "a & b\n~~~\nx &amp; y\n~~~\nc & d",
  "content: fenced ~~~ block is preserved verbatim")

const unclosed = "a &amp; b\n```\nx &amp; y\nno closing fence"
eq(decodeMarkdownAmpEntities(unclosed), "a & b\n```\nx &amp; y\nno closing fence",
  "content: an unclosed fence protects everything after it (CommonMark: runs to end)")

eq(decodeMarkdownAmpEntities("escaped &lt;script&gt; stays escaped"), "escaped &lt;script&gt; stays escaped",
  "content: &lt;/&gt; are NEVER decoded — that would turn escaped text into raw HTML")

eq(decodeMarkdownAmpEntities("show &amp;copy; literally"), "show &amp;copy; literally",
  "content: &amp; that would form a new entity is kept — decoding would change rendered output")

eq(decodeMarkdownAmpEntities("&amp;#169; stays"), "&amp;#169; stays",
  "content: &amp; before a numeric entity is kept")

eq(decodeMarkdownAmpEntities("no entities here"), "no entities here", "content: clean input untouched")
eq(decodeMarkdownAmpEntities(""), "", "content: empty string")

console.log(`\n${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
} else {
  console.log("All tests passed.")
}
