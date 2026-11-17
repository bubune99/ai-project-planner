/* Run: npx -y tsx@4.23.15 lib/upkeep/stale-check.assert.ts */
import { findStale, questionFor, summarize, titleKey, type StepRow } from "./stale-check"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}
const now = Date.parse("2026-11-17T12:00:00Z")
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString()
const row = (id: string, o: Partial<StepRow>): StepRow => ({ id, projectId: "p1", project: "Planner", title: `t${id}`, status: "pending", statusKind: "open", updatedAt: ago(1), createdAt: ago(40), fromTodo: false, ...o })

eq(titleKey("  Fix the  Login page. "), "fix the login page", "case, spacing and the trailing full stop do not matter")

const f = findStale([
  row("a", { statusKind: "active", status: "in-progress", updatedAt: ago(20) }),
  row("b", { statusKind: "active", status: "in-progress", updatedAt: ago(13) }),
  row("c", { statusKind: "done", status: "completed", updatedAt: ago(90) }),
  row("d", { title: "Add search", createdAt: ago(30) }),
  row("e", { title: "add search.", createdAt: ago(10) }),
  row("f", { title: "Add search", projectId: "p2", project: "BYB" }),
  row("g", { title: "Add search", statusKind: "done", status: "completed" }),
  row("h", { fromTodo: true, updatedAt: ago(45) }),
  row("i", { fromTodo: true, updatedAt: ago(5) }),
], now)
eq(f.filter((x) => x.kind === "idle").map((x) => [x.stepIds[0], x.days]), [["a", 20]], "in progress and still for 14 days or more is idle; 13 days is not; done cards never")
eq(f.filter((x) => x.kind === "duplicate").map((x) => x.stepIds), [["d", "e"]], "same title in one project, both open, older first; another project or a finished card is not a twin")
eq(f.filter((x) => x.kind === "unreviewed").map((x) => x.stepIds), [["h"]], "carried-over cards untouched for 30 days are counted; one touched recently is not")
eq(summarize(f), { idle: 1, duplicate: 1, unreviewed: 1 }, "the counts")

const q = questionFor(f, "p1")
eq(q?.question, "1 card has a twin with the same title in Planner. Merge them?", "one question per project, in plain words")
eq(q?.options.length, 3, "three one-tap answers")
eq(/"Add search" \(2 cards: d, e\)/.test(q?.context ?? ""), true, "the context names each pair")
eq(questionFor(f, "p2"), null, "no question when nothing in that project is the owner's to decide")
eq(questionFor(findStale([row("a", { statusKind: "active", updatedAt: ago(30) })], now), "p1"), null, "idle cards never become a question for the owner")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
