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
  passesFilter, staleDays, filterCounts, passesColumns, isFiltered, NO_FILTER, type WorkColumns,
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

/* ───────────────────────────────── filters ───────────────────────────────── */
// Owner, 2026-11-15: "The ability also to filter through this long list of tasks and to-dos would also be really
// nice. In general this list really does need a look at stale things".
{
  const NOW = new Date(2026, 10, 15, 12)
  const d = (n: number) => new Date(2026, 10, 15 + n, 12).toISOString()
  const late = item({ id: "late", dueDate: d(-3), priority: "low", updatedAt: d(-2) })
  const soon = item({ id: "soon", dueDate: d(4), priority: "urgent", updatedAt: d(-1) })
  const far = item({ id: "far", dueDate: d(30), priority: "high", updatedAt: d(-200) })
  const none = item({ id: "none", dueDate: null, priority: null, updatedAt: d(-91), kind: "todo" })
  const all = [late, soon, far, none]
  const ids = (only: Parameters<typeof passesFilter>[1]) => all.filter((x) => passesFilter(x, only, NOW)).map((x) => x.id).join()
  eq(ids("all"), "late,soon,far,none", "all keeps everything")
  eq(ids("overdue"), "late", "overdue is due before today")
  eq(ids("week"), "soon", "this week is due today or in the next 7 days, not overdue")
  eq(ids("nodate"), "none", "no date")
  eq(ids("hot"), "soon,far", "urgent and high")
  eq(ids("stale"), "far,none", "stale is not touched in 90 days")
  eq(ids("todo"), "none", "todos only")
  eq(ids("step"), "late,soon,far", "tasks only")
  eq(staleDays(far, NOW), 200, "how long since it was touched, in days")
  eq(JSON.stringify(filterCounts(all, NOW)), JSON.stringify({ all: 4, overdue: 1, week: 1, nodate: 1, hot: 2, stale: 2, todo: 1, step: 3 }), "counts for every filter")
  // Owner, same day: "Major rule, chip filters when we can have drop downs in relation to a column." One choice per
  // column, and the columns combine.
  const pick = (f: Partial<WorkColumns>) => all.filter((x) => passesColumns(x, { ...NO_FILTER, ...f }, NOW)).map((x) => x.id).join()
  eq(pick({}), "late,soon,far,none", "no column chosen keeps everything")
  eq(pick({ priority: "hot" }), "soon,far", "priority column: urgent and high")
  eq(pick({ priority: "none" }), "none", "priority column: none set")
  eq(pick({ priority: "low" }), "late", "priority column: one level")
  eq(pick({ due: "overdue" }), "late", "due column: overdue")
  eq(pick({ status: "stale" }), "far,none", "status column: not touched in 90 days")
  eq(pick({ status: "stale", kind: "step" }), "far", "columns combine")
  eq(pick({ status: "stale", priority: "hot", due: "nodate" }), "", "columns that exclude each other leave nothing")
  eq(isFiltered(NO_FILTER), false, "nothing chosen")
  eq(isFiltered({ ...NO_FILTER, due: "week" }), true, "something chosen")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
