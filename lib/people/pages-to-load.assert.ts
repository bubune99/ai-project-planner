/**
 * People and flows loads every page a step links to. Found 2026-11-16 on Project Dzidzor:
 * the owner saw "0 verified" although /admin/users had all 36 checks cleared and four steps
 * linked to it, because the tab loaded only the first 8 scanned pages and Users was the
 * 10th, so its steps counted as "nothing behind them".
 * Run: node_modules/.bin/tsx lib/people/pages-to-load.assert.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { pagesToLoad, BROWSE_PAGES } from "./pages-to-load"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name) }

const pages = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, route: `/r${i}` }))
const doc = (routes: string[]) => ({ flows: [{ steps: routes.map((route) => ({ ref: { route } })) }, { steps: [{ ref: null }] }] })

ok("a page a step links to is loaded even past the first 8", () => {
  const ids = pagesToLoad(pages, doc(["/r10"]), null)
  assert.ok(ids.includes("p10"))
})

ok("the page being looked at is loaded", () => {
  assert.ok(pagesToLoad(pages, doc([]), "/r11").includes("p11"))
})

ok("others fill up to the browse limit, without repeats, in their order", () => {
  const ids = pagesToLoad(pages, doc(["/r10", "/r10", "/r0"]), null)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids.slice(0, 2), ["p10", "p0"])
  assert.equal(ids.length, 2 + BROWSE_PAGES, "the two linked pages, then 8 others to browse")
})

ok("a link to a page nobody scanned loads nothing for it", () => {
  assert.deepEqual(pagesToLoad(pages.slice(0, 2), doc(["/gone"]), null), ["p0", "p1"])
})

ok("nothing to load without pages", () => {
  assert.deepEqual(pagesToLoad(undefined, doc(["/r1"]), null), [])
})

ok("the tab uses it instead of the first 8", () => {
  const tab = readFileSync(new URL("../../components/project/opx/PeopleFlowsTab.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(tab, /slice\(0, 8\)/)
  assert.match(tab, /pagesToLoad\(pages, doc, route\)/)
})

console.log(`\n${n} checks passed`)
