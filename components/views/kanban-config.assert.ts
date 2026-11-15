// npx -y tsx@4.23.15 components/views/kanban-config.assert.ts
import assert from "node:assert/strict"
import { PRIORITY_COLUMNS, PRIORITY_RANK, AGENT_COLUMNS, NONE_KEY, UNTITLED_TASK, groupKeyOf, leftUntouched, sortSteps } from "./kanban-config"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const step = (over: Record<string, unknown>) => ({ id: String(over.id ?? Math.random()), title: "x", status: "pending", ...over }) as never

t("every priority a step can have lands on a column when grouped by priority", () => {
  const keys = new Set(PRIORITY_COLUMNS.map((c) => c.key))
  for (const p of ["urgent", "high", "medium", "low", null, undefined]) {
    assert.ok(keys.has(groupKeyOf(step({ priority: p }), "priority")), `priority ${String(p)} has no column`)
  }
  assert.equal(groupKeyOf(step({ priority: null }), "priority"), NONE_KEY)
})

t("urgent comes first: as the first column and at the top of a sort by priority", () => {
  assert.equal(PRIORITY_COLUMNS[0].key, "urgent")
  const sorted = sortSteps([step({ id: "a", priority: "low" }), step({ id: "b", priority: null }), step({ id: "c", priority: "urgent" }), step({ id: "d", priority: "medium" }), step({ id: "e", priority: "high" })], "priority")
  assert.deepEqual(sorted.map((s: { id: string }) => s.id), ["c", "e", "d", "a", "b"])
  assert.ok(PRIORITY_RANK.urgent < PRIORITY_RANK.high)
})

t("medium is shown as Normal, the word the cards use", () => {
  assert.equal(PRIORITY_COLUMNS.find((c) => c.key === "medium")?.label, "Normal")
})

t("every agent value lands on a column when grouped by agent", () => {
  const keys = new Set(AGENT_COLUMNS.map((c) => c.key))
  for (const a of ["claude", "v0", "gemini", "gpt", null, undefined]) {
    assert.ok(keys.has(groupKeyOf(step({ assigned_agent: a }), "agent")), `agent ${String(a)} has no column`)
  }
})

t("a card made by Add task and left exactly as made is not kept; anything typed, set or added keeps it", () => {
  const made = step({ id: "n1", title: UNTITLED_TASK, status: "blocked", priority: null, description: null })
  assert.equal(leftUntouched(made, { ...(made as object) } as never, 0), true)
  assert.equal(leftUntouched(made, { ...(made as object), title: "Call the bank" } as never, 0), false)
  assert.equal(leftUntouched(made, { ...(made as object), description: "a note" } as never, 0), false)
  assert.equal(leftUntouched(made, { ...(made as object), priority: "high" } as never, 0), false)
  assert.equal(leftUntouched(made, { ...(made as object), end_date: "2026-12-01" } as never, 0), false)
  assert.equal(leftUntouched(made, { ...(made as object) } as never, 1), false)
  assert.equal(leftUntouched(made, null, 0), false)
  assert.equal(leftUntouched(made, step({ id: "other", title: UNTITLED_TASK, status: "blocked" }), 0), false)
})

console.log(`\n${n} kanban-config checks passed`)
