// npx -y tsx@4.23.15 lib/walks/step-coverage.assert.ts
import assert from "node:assert/strict"
import { coverageLine, flowCoverage, readCovers, stepsWithWay, walkCovers, type CoverWalk } from "./step-coverage"
import type { Step, UseCase } from "@/lib/people/people-model"

let n = 0
const t = (_name: string, fn: () => void) => { fn(); n++ }
const step = (id: string, route = "/shop", over: Partial<Step> = {}): Step => ({ id, does: `do ${id}`, expects: "e", data: "", ref: { route, view: "page", kind: "Button", label: id }, ...over })
// a → b (choice: way "refuse" ends with r1; way "email" rejoins with e1, e2) → c → d
const flow: Pick<UseCase, "id" | "steps"> = {
  id: "u1",
  steps: [step("a"), step("b", "/cart", { ways: [{ id: "refuse", label: "Refused", ends: true, steps: [step("r1", "/cart")] }, { id: "email", label: "By email", ends: false, steps: [step("e1", "/mail"), step("e2", "/mail")] }] }), step("c", "/pay"), step("d", "/done")],
}
const walk = (over: Partial<CoverWalk> = {}): CoverWalk => ({ useCase: "u1", at: "2026-11-24T10:00:00Z", outcome: "reached", ...over })
const ship = (sha: string, routes: string[], at = "2026-11-24T12:00:00Z", over = {}) => ({ sha, env: "production", routes, everywhere: false, at, ...over })

t("steps are listed main line first, each way after its step", () => {
  assert.deepEqual(stepsWithWay(flow).map((x) => `${x.step.id}:${x.way ?? "-"}`), ["a:-", "b:-", "r1:refuse", "e1:email", "e2:email", "c:-", "d:-"])
})

t("what a walk covered", () => {
  assert.deepEqual(walkCovers(flow, {}), ["a", "b", "c", "d"], "a walk that says nothing covered the main line (every earlier walk)")
  assert.deepEqual(walkCovers(flow, { way: "email" }), ["a", "b", "e1", "e2", "c", "d"], "a way that rejoins goes on with the main line")
  assert.deepEqual(walkCovers(flow, { way: "refuse" }), ["a", "b", "r1"], "a way that ends stops there")
  assert.deepEqual(walkCovers(flow, { covers: ["c", "zz", "d"] }), ["c", "d"], "a partial walk: only steps that exist")
  assert.deepEqual(walkCovers(flow, { way: "gone" }), ["a", "b", "c", "d"], "a way that no longer exists counts as the main line")
})

t("coverage: never, walked, stopped, and the ways owed", () => {
  const none = flowCoverage(flow, [], [])
  assert.equal(none.walked, 0); assert.equal(none.total, 7)
  assert.deepEqual(none.ways.map((w) => w.walked), [false, false])
  const c = flowCoverage(flow, [walk()], [])
  assert.deepEqual(c.steps.filter((s) => s.state === "walked").map((s) => s.id), ["a", "b", "c", "d"])
  assert.equal(coverageLine(c), '4 of 7 steps walked; the ways "Refused", "By email" never walked.')
  const partial = flowCoverage(flow, [walk({ covers: ["c", "d"], outcome: "blocked" })], [])
  assert.deepEqual(partial.steps.filter((s) => s.state !== "never").map((s) => `${s.id}:${s.state}`), ["c:stopped", "d:stopped"])
  const both = flowCoverage(flow, [walk(), walk({ way: "refuse", at: "2026-11-24T11:00:00Z" })], [])
  assert.deepEqual(both.ways.map((w) => [w.id, w.walked]), [["refuse", true], ["email", false]])
  assert.equal(coverageLine(both), '5 of 7 steps walked; the way "By email" never walked.')
})

t("the latest walk of each step counts, and other use cases are not mixed in", () => {
  const c = flowCoverage(flow, [walk({ outcome: "blocked", at: "2026-11-24T09:00:00Z" }), walk({ covers: ["a"], at: "2026-11-24T11:00:00Z" }), walk({ useCase: "u2", way: "email" })], [])
  assert.deepEqual(c.steps.filter((s) => s.state !== "never").map((s) => `${s.id}:${s.state}`), ["a:walked", "b:stopped", "c:stopped", "d:stopped"])
})

t("a ship to a step's page after its walk changes that step only", () => {
  const c = flowCoverage(flow, [walk()], [ship("aaaaaaa1", ["/pay"]), ship("bbbbbbb2", ["/pay"], "2026-11-24T08:00:00Z"), ship("ccccccc3", ["/pay"], "2026-11-24T12:00:00Z", { env: "report" })])
  assert.deepEqual(c.steps.filter((s) => s.state === "changed").map((s) => [s.id, s.changes]), [["c", ["aaaaaaa"]]], "not an older ship, not a report")
  assert.equal(coverageLine(c), '4 of 7 steps walked; 1 changed since; the ways "Refused", "By email" never walked.')
  const all = flowCoverage(flow, [walk()], [ship("ddddddd4", [], "2026-11-24T12:00:00Z", { everywhere: true })])
  assert.equal(all.steps.filter((s) => s.state === "changed").length, 4, "a shared file changes every walked step")
  assert.equal(all.steps.filter((s) => s.state === "never").length, 3, "a step never walked stays never, not changed")
})

t("a ship of the very build a walk ran on does not make its steps changed", () => {
  // Card e62773e6: walked on staging build 2710e1b, then 2710e1b was recorded as shipped to production afterwards.
  const same = flowCoverage(flow, [walk({ build: "aaaaaaa" })], [ship("aaaaaaa1", ["/pay"])])
  assert.equal(same.steps.filter((s) => s.state === "changed").length, 0, "short or long sha, same commit")
  const longWalk = flowCoverage(flow, [walk({ build: "aaaaaaa1ffff" })], [ship("aaaaaaa", ["/pay"])])
  assert.equal(longWalk.steps.filter((s) => s.state === "changed").length, 0, "the walk's sha may be the longer one")
  const other = flowCoverage(flow, [walk({ build: "aaaaaaa" })], [ship("aaaaaaa1", ["/pay"]), ship("eeeeeee5", ["/pay"])])
  assert.deepEqual(other.steps.filter((s) => s.state === "changed").map((s) => [s.id, s.changes]), [["c", ["eeeeeee"]]], "a different build after the walk still counts")
  const noBuild = flowCoverage(flow, [walk()], [ship("aaaaaaa1", ["/pay"])])
  assert.equal(noBuild.steps.filter((s) => s.state === "changed").length, 1, "a walk that names no build keeps the old rule")
})

t("a step reworded after its walk is owed again; one reworded before is not", () => {
  const f = { ...flow, steps: flow.steps.map((x) => (x.id === "c" ? { ...x, changedAt: "2026-11-24T11:00:00Z" } : x.id === "d" ? { ...x, changedAt: "2026-11-24T09:00:00Z" } : x)) }
  const c = flowCoverage(f, [walk()], [])
  assert.deepEqual(c.steps.filter((s) => s.state === "changed").map((s) => [s.id, s.reworded, s.changes]), [["c", true, []]])
  assert.equal(flowCoverage(f, [walk(), walk({ covers: ["c"], at: "2026-11-24T11:30:00Z" })], []).steps.find((s) => s.id === "c")!.state, "walked", "walking just that step settles it")
})

t("reading what a partial walk names", () => {
  assert.deepEqual(readCovers(flow, { steps: "c, d" }), { ok: true, covers: ["c", "d"] })
  assert.deepEqual(readCovers(flow, { from: "b", to: "c" }), { ok: true, covers: ["b", "c"] })
  assert.deepEqual(readCovers(flow, { from: "e1", way: "email" }), { ok: true, covers: ["e1", "e2", "c", "d"], way: "email" })
  assert.deepEqual(readCovers(flow, { way: "refuse" }), { ok: true, way: "refuse" })
  assert.deepEqual(readCovers(flow, {}), { ok: true })
  assert.match((readCovers(flow, { steps: "a,zz" }) as { error: string }).error, /zz/)
  assert.match((readCovers(flow, { from: "d", to: "a" }) as { error: string }).error, /comes before/)
  assert.match((readCovers(flow, { from: "e1" }) as { error: string }).error, /main line/, "a way's step is not on the main line")
  assert.match((readCovers(flow, { way: "nope" }) as { error: string }).error, /refuse \(Refused\), email \(By email\)/)
})

console.log(`step-coverage: ${n} groups of checks passed`)
