/**
 * Assertions for lib/work-items.ts.
 *   npx -y tsx@4.23.15 lib/work-items.assert.ts
 */

import {
  unmirroredTodoIds,
  compareWork,
  groupWork,
  dueText,
  matchesQuery,
  type WorkItem,
} from "./work-items"

let pass = 0
let fail = 0
function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) pass++
  else {
    fail++
    console.error(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`)
  }
}

const NOW = new Date(2026, 9, 3, 12, 0) // 3 Oct 2026, local noon
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString()

let n = 0
function item(over: Partial<WorkItem>): WorkItem {
  n++
  return {
    kind: "step",
    id: `w${n}`,
    title: `Item ${n}`,
    description: null,
    status: "pending",
    statusKind: "open",
    priority: null,
    dueDate: null,
    projectId: "p1",
    projectName: "Alpha",
    createdAt: iso(2026, 9, 1),
    updatedAt: iso(2026, 9, 1),
    ...over,
  }
}

/* ───────────────────────── the de-duplication rule ────────────────────── */

const todos = [
  { id: "t-mirror", stepId: "s-1" },
  { id: "t-personal", stepId: null },
  { id: "t-new-project", stepId: null },
]
const kept = unmirroredTodoIds(todos)
eq(kept.has("t-mirror"), false, "a todo that points at a step is dropped — its step is shown instead")
eq(kept.has("t-personal"), true, "a personal todo is kept")
eq(kept.has("t-new-project"), true, "a project todo with no step twin is kept, not lost")
eq(kept.size, 2, "exactly the unmirrored todos survive")
eq(unmirroredTodoIds([]).size, 0, "no todos, nothing kept")

/* ───────────────────────────────── ordering ───────────────────────────── */

const overdueLow = item({ priority: "low", dueDate: iso(2026, 10, 1) })
const urgentUndated = item({ priority: "urgent" })
eq(compareWork(overdueLow, urgentUndated, NOW) < 0, true, "anything overdue outranks priority — it is already late")

const high = item({ priority: "high" })
const low = item({ priority: "low" })
eq(compareWork(high, low, NOW) < 0, true, "higher priority first")

const dueSoon = item({ priority: "high", dueDate: iso(2026, 10, 5) })
const dueLater = item({ priority: "high", dueDate: iso(2026, 10, 20) })
eq(compareWork(dueSoon, dueLater, NOW) < 0, true, "same priority: sooner due date first")

const dated = item({ priority: "medium", dueDate: iso(2026, 11, 1) })
const undated = item({ priority: "medium" })
eq(compareWork(dated, undated, NOW) < 0, true, "same priority: a dated item outranks an undated one")

const noPri = item({ priority: null })
eq(compareWork(low, noPri, NOW) < 0, true, "an item with no priority sorts after 'low'")

/* ───────────────────────────────── grouping ───────────────────────────── */

const groups = groupWork(
  [
    item({ projectId: "pA", projectName: "Alpha" }),
    item({ projectId: "pB", projectName: "Beta" }),
    item({ projectId: "pB", projectName: "Beta" }),
    item({ projectId: "pB", projectName: "Beta" }),
    item({ projectId: null, projectName: null, kind: "todo" }),
    item({ projectId: "pA", projectName: "Alpha", dueDate: iso(2026, 9, 28) }),
  ],
  NOW,
)
eq(groups.map((g) => g.label), ["Beta", "Alpha", "Personal"], "largest project first, Personal always last")
eq(groups.map((g) => g.items.length), [3, 2, 1], "every item lands in exactly one group")
eq(groups.find((g) => g.label === "Alpha")!.overdue, 1, "a group counts its overdue items")
eq(groups.find((g) => g.label === "Personal")!.projectId, null, "the personal group has no project id")
eq(
  groups.reduce((a, g) => a + g.items.length, 0),
  6,
  "grouping neither drops nor duplicates an item",
)

const tie = groupWork(
  [item({ projectId: "pZ", projectName: "Zed" }), item({ projectId: "pM", projectName: "Mid" })],
  NOW,
)
eq(tie.map((g) => g.label), ["Mid", "Zed"], "equal-sized groups fall back to alphabetical")

eq(groupWork([], NOW), [], "no work, no groups")
eq(
  groupWork([item({ projectId: "pX", projectName: null })], NOW)[0].label,
  "Untitled project",
  "a project with no name still gets a readable header",
)

/* ───────────────────────────────── due text ───────────────────────────── */

eq(dueText(null, NOW), { text: "", overdue: false, soon: false }, "undated shows nothing")
eq(dueText("garbage", NOW), { text: "", overdue: false, soon: false }, "an unparseable date shows nothing, not NaN")
eq(dueText(iso(2026, 9, 30), NOW).text, "Overdue 3d", "overdue reads as days late")
eq(dueText(iso(2026, 9, 30), NOW).overdue, true, "overdue is flagged")
eq(dueText(iso(2026, 10, 3), NOW).text, "Today", "due today")
eq(dueText(iso(2026, 10, 4), NOW).text, "Tomorrow", "due tomorrow")
eq(dueText(iso(2026, 10, 9), NOW), { text: "Oct 9", overdue: false, soon: true }, "within a week is 'soon'")
eq(dueText(iso(2026, 11, 20), NOW).soon, false, "further out is not 'soon'")

/* ───────────────────────────────── search ─────────────────────────────── */

const s = item({ title: "Wire the catalog scanner", description: "run in CI", projectName: "Mission Control" })
eq(matchesQuery(s, ""), true, "an empty query matches everything")
eq(matchesQuery(s, "CATALOG"), true, "title match is case-insensitive")
eq(matchesQuery(s, "in ci"), true, "description is searched")
eq(matchesQuery(s, "mission"), true, "project name is searched")
eq(matchesQuery(s, "stripe"), false, "a non-match is excluded")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
