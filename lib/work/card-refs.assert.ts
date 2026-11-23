// npx -y tsx@4.23.15 lib/work/card-refs.assert.ts
import assert from "node:assert/strict"
import { MAX_CODE_CHARS, MAX_SAMPLES, addCodeRef, addCodeSample, codeRefs, codeSamples, langOf, readCodeRef, readCodeSample, readLines, removeRef } from "./card-refs"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++ }
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => { if (!r.ok) throw new Error(r.error); return r.value }

t("languages", () => {
  assert.equal(langOf("TypeScript"), "ts")
  assert.equal(langOf("", "mock.tsx"), "tsx")
  assert.equal(langOf("cobol"), "text")
  assert.equal(langOf(undefined, "notes"), "text")
})

t("lines", () => {
  assert.equal(readLines("12"), "12")
  assert.equal(readLines("L12-L30"), "12-30")
  assert.equal(readLines(12, 30), "12-30")
  assert.equal(readLines(30, 12), "30", "a backwards range keeps the start")
  assert.equal(readLines("0"), null)
  assert.equal(readLines("twelve"), null)
})

t("a reference from a repo and path becomes a GitHub link", () => {
  const r = ok(readCodeRef({ repo: "bubune99/ai-project-planner", path: "./components/views/KanbanView.tsx", lines: "130-150" }, "r1"))
  assert.equal(r.url, "https://github.com/bubune99/ai-project-planner/blob/main/components/views/KanbanView.tsx#L130-L150")
  assert.equal(r.label, "components/views/KanbanView.tsx:130-150")
  assert.equal(ok(readCodeRef({ repo: "a/b", path: "x.ts", ref: "3b4e544" }, "r2")).url, "https://github.com/a/b/blob/3b4e544/x.ts")
})

t("a GitHub link is kept, its path and lines read from it", () => {
  const r = ok(readCodeRef({ url: "https://github.com/a/b/blob/9f1/lib/x.ts#L5-L9", label: "The rule" }, "r3"))
  assert.equal(r.path, "lib/x.ts"); assert.equal(r.lines, "5-9"); assert.equal(r.label, "The rule")
})

t("anything that is not GitHub, or a path that climbs out, is refused", () => {
  assert.equal(readCodeRef({ url: "https://evil.example/a/b" }, "x").ok, false)
  assert.equal(readCodeRef({ url: "javascript:alert(1)" }, "x").ok, false)
  assert.equal(readCodeRef({ repo: "a/b", path: "../../etc/passwd" }, "x").ok, false)
  assert.equal(readCodeRef({ repo: "a/b", path: "/abs.ts" }, "x").ok, false)
  assert.equal(readCodeRef({ repo: "not a repo", path: "x.ts" }, "x").ok, false)
  assert.equal(readCodeRef({ repo: "a/b", path: "x.ts", ref: "main;rm" }, "x").ok, false)
})

t("samples", () => {
  const s = ok(readCodeSample({ code: "const a = 1\r\n", title: "mock.js" }, "s1"))
  assert.equal(s.code, "const a = 1\n"); assert.equal(s.lang, "js")
  assert.equal(readCodeSample({ code: "   " }, "s").ok, false)
  assert.equal(readCodeSample({ code: "x".repeat(MAX_CODE_CHARS + 1) }, "s").ok, false)
})

t("adding keeps the rest of the card, skips a repeat, and stops at the limit", () => {
  const meta = { pictures: [{ url: "https://x/p.png", caption: "" }], proposal: { goal: "g" } }
  const s = ok(readCodeSample({ code: "a()" }, "s1"))
  const m1 = ok(addCodeSample(meta, s))
  assert.deepEqual(m1.pictures, meta.pictures); assert.deepEqual(m1.proposal, meta.proposal)
  assert.equal(codeSamples(ok(addCodeSample(m1, { ...s, id: "s2" }))).length, 1, "the same code twice is kept once")
  let m: Record<string, unknown> = {}
  for (let i = 0; i < MAX_SAMPLES; i++) m = ok(addCodeSample(m, { id: `s${i}`, title: "c", lang: "js", code: `f${i}()` }))
  assert.equal(addCodeSample(m, { id: "over", title: "c", lang: "js", code: "g()" }).ok, false)
  assert.equal(meta.pictures.length, 1, "the original is never changed")
})

t("references and removal", () => {
  const r = ok(readCodeRef({ repo: "a/b", path: "x.ts" }, "r1"))
  const m = ok(addCodeRef(ok(addCodeSample({}, { id: "s1", title: "c", lang: "js", code: "a" })), r))
  assert.equal(codeRefs(m).length, 1)
  assert.equal(codeRefs(ok(addCodeRef(m, { ...r, id: "r2" }))).length, 1, "the same link twice is kept once")
  const gone = removeRef(m, "r1")
  assert.equal(codeRefs(gone).length, 0); assert.equal(codeSamples(gone).length, 1)
  assert.equal(codeSamples(removeRef(m, "s1")).length, 0)
})

t("stored entries that were tampered with are not shown", () => {
  const m = { code: [{ id: "a", code: "" }, { id: "b", code: "ok", lang: "evil" }, null], codeRefs: [{ id: "c", url: "https://evil.example/x" }, { id: "d", url: "https://github.com/a/b" }] }
  assert.deepEqual(codeSamples(m).map((s) => [s.id, s.lang]), [["b", "text"]])
  assert.deepEqual(codeRefs(m).map((r) => r.id), ["d"])
})

console.log(`card-refs: ${n} groups of checks passed`)
