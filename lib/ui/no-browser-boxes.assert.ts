/*
 * No screen calls the browser's own confirm(), alert() or prompt(). Walks app/ and components/ and fails, naming the
 * file and line, on any such call. Run: npx -y tsx@4.23.15 lib/ui/no-browser-boxes.assert.ts
 */

import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { findBrowserBoxes } from "./no-browser-boxes"

let passed = 0
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log(`ok  ${name}`) }

ok("a bare call is found, with its line", () => {
  assert.deepEqual(findBrowserBoxes(`const a = 1\nif (!confirm("Delete?")) return\n`), [{ line: 2, call: "confirm" }])
})
ok("window., globalThis. and self. calls are found", () => {
  assert.deepEqual(findBrowserBoxes(`window.prompt("Why?"); globalThis.alert("x"); self.confirm("y")`).map((h) => h.call), ["window.prompt", "globalThis.alert", "self.confirm"])
})
ok("a call inside JSX is found", () => {
  assert.equal(findBrowserBoxes(`const A = () => <button onClick={() => { alert("no") }}>x</button>`).length, 1)
})
ok("comments and strings are not hits", () => {
  assert.deepEqual(findBrowserBoxes("// confirm('x')\n/* alert('y') */\nconst s = \"prompt('z')\"; const t = `confirm(${1})`\n"), [])
})
ok("a method of something else, a property and a word in text are not hits", () => {
  assert.deepEqual(findBrowserBoxes(`toast.confirm("x"); const o = { confirm: "Delete" }; const J = () => <p>Please confirm (now)</p>`), [])
})

/*
 * Files left as they are, each with the reason. A file belongs here only when no route uses it (dead code is left
 * alone rather than repaired); anything a person can reach is fixed instead.
 */
const ALLOWED_DEAD_FILES: Record<string, string> = {}

const ROOT = resolve(__dirname, "../..")
const SKIP = new Set(["node_modules", ".next"])
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return []
    const path = join(dir, e.name)
    if (e.isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(e.name) ? [path] : []
  })
}

ok("no screen under app/ or components/ calls confirm(), alert() or prompt()", () => {
  const files = ["app", "components"].flatMap((d) => sources(join(ROOT, d)))
  assert.ok(files.length > 100, `expected to read the app's sources, found ${files.length}`)
  const found = files.flatMap((path) => {
    const name = relative(ROOT, path).split("\\").join("/")
    if (name in ALLOWED_DEAD_FILES) return []
    return findBrowserBoxes(readFileSync(path, "utf8"), name).map((h) => `${name}:${h.line}  ${h.call}()`)
  })
  assert.equal(found.length, 0, `${found.length} browser box call(s). Use askConfirm / askText from lib/ui/ask.ts:\n${found.join("\n")}`)
})

console.log(`\n${passed} passed`)
