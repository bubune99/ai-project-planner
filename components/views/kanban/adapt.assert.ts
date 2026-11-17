/**
 * Assertions for adapt.ts. Run with a tsx that is not 4.21.0:
 *   npx -y tsx@4.23.15 components/views/kanban/adapt.assert.ts
 * (the pinned 4.21.0 reports a bogus "does not provide an export named" error)
 */

import {
  toBoardPriority,
  toDue,
  toProgress,
  toKanbanTask,
  toKanbanColumns,
  toFootnotes, toSubtaskList } from "./adapt"

let pass = 0
let fail = 0

function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    pass++
  } else {
    fail++
    console.error(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`)
  }
}

/* ---------------------------------------------------------------- priority */

eq(toBoardPriority("urgent"), "urgent", "urgent survives (added by migration 056)")
eq(toBoardPriority("high"), "high", "high survives")
eq(toBoardPriority("medium"), "normal", "medium is renamed to the board's normal")
eq(toBoardPriority("low"), "low", "low survives")
eq(toBoardPriority(null), undefined, "null priority renders no chip")
eq(toBoardPriority(undefined), undefined, "missing priority renders no chip")

/* -------------------------------------------------------------------- due */

const TODAY = new Date(2026, 9, 3) // 3 Oct 2026, local

eq(toDue({ end_date: null }, false, TODAY), {}, "undated step gets no date row")
eq(toDue({ end_date: "" }, false, TODAY), {}, "empty string is not a date")
eq(toDue({ end_date: "not-a-date" }, false, TODAY), {}, "unparseable date is dropped, not NaN")

eq(
  toDue({ end_date: new Date(2026, 9, 3, 9, 0).toISOString() }, false, TODAY),
  { due: "Today", dueSoon: true },
  "today reads Today and is amber",
)
eq(
  toDue({ end_date: new Date(2026, 9, 4, 9, 0).toISOString() }, false, TODAY),
  { due: "Tomorrow", dueSoon: true },
  "tomorrow reads Tomorrow and is amber",
)
eq(
  toDue({ end_date: new Date(2026, 9, 1).toISOString() }, false, TODAY),
  { due: "Oct 1", dueSoon: true },
  "overdue keeps its date but is amber",
)
eq(
  toDue({ end_date: new Date(2026, 9, 20).toISOString() }, false, TODAY),
  { due: "Oct 20", dueSoon: false },
  "far future is not amber",
)
eq(
  toDue({ end_date: new Date(2026, 9, 1).toISOString() }, true, TODAY),
  { due: "Oct 1", dueSoon: false },
  "a DONE step is never amber, however overdue",
)
eq(
  toDue({ end_date: new Date(2026, 11, 25).toISOString() }, false, TODAY),
  { due: "Dec 25", dueSoon: false },
  "month rolls over correctly",
)

/* --------------------------------------------------------------- progress */

eq(toProgress({ progress: 0 }, false), 0, "zero progress is shown, not hidden")
eq(toProgress({ progress: 35 }, false), 35, "progress passes through")
eq(toProgress({ progress: 12.6 }, false), 13, "progress is rounded")
eq(toProgress({ progress: -5 }, false), 0, "negative progress clamps to 0")
eq(toProgress({ progress: 150 }, false), 100, "over-100 clamps to 100")
eq(toProgress({ progress: 20 }, true), 100, "a done step reads 100 regardless of its number")
eq(toProgress({ progress: NaN }, false), undefined, "NaN hides the ring rather than drawing garbage")

/* ------------------------------------------------------------------- task */

const statusMap = {
  todo: { key: "todo", label: "To do", color: "#888", kind: "open" as const },
  shipped: { key: "shipped", label: "Shipped", color: "#0a0", kind: "done" as const },
}

const base = {
  id: "s1",
  project_id: "p1",
  title: "Audit empty states",
  description: "Every list, table and search result",
  status: "todo",
  progress: 40,
  tags: ["Web app", "ignored-second-tag"],
  phase: null,
  stage: null,
  estimated_hours: null,
  actual_hours: null,
  order_index: 0,
  priority: "medium" as const,
  assigned_agent: "claude" as const,
  start_date: null,
  end_date: new Date(2026, 9, 4).toISOString(),
  parent_task_id: null,
  is_subtask: false,
  tasks: [],
  acceptance_criteria: [],
  dependencies: [],
  metadata: null,
  created_at: "",
  updated_at: "",
  completed_at: null,
}

const t = toKanbanTask(base as never, { statusMap, today: TODAY })
eq(t.id, "s1", "id carries")
eq(t.title, "Audit empty states", "title carries")
eq(t.note, "Every list, table and search result", "description becomes note")
eq(t.priority, "normal", "medium maps to normal through the task adapter")
eq(t.category, "Web app", "first tag becomes the category chip")
eq(t.assignees, [{ name: "claude" }], "assigned_agent becomes a single assignee")
eq(t.due, "Tomorrow", "due is humanised")
eq(t.dueSoon, true, "due tomorrow is amber")
eq(t.progress, 40, "progress reaches the ring")

const noDesc = toKanbanTask({ ...base, description: null, tags: [] } as never, { statusMap, today: TODAY })
eq(noDesc.note, undefined, "null description yields no note line")
eq(noDesc.category, undefined, "no tags yields no category chip")

const done = toKanbanTask({ ...base, status: "shipped", progress: 10 } as never, { statusMap, today: TODAY })
eq(done.progress, 100, "status done overrides a stale progress number")
eq(done.dueSoon, false, "done step is not amber")

const unknownStatus = toKanbanTask({ ...base, status: "mystery" } as never, { statusMap, today: TODAY })
eq(unknownStatus.progress, 40, "an unmapped status falls back to open, not done")

/* ---------------------------------------------------------------- columns */

const cols = toKanbanColumns(
  [
    { key: "todo", label: "To do", pillClass: "", dotClass: "", colorHex: "#8b5cf6" },
    { key: "shipped", label: "Shipped", pillClass: "", dotClass: "" },
  ],
  (key) => (key === "todo" ? [base as never] : []),
  { statusMap, today: TODAY },
)
eq(cols.length, 2, "every column definition becomes a column")
eq(cols[0].id, "todo", "column key becomes id")
eq(cols[0].name, "To do", "column label becomes name")
eq(cols[0].accentHex, "#8b5cf6", "a custom status hex is preserved, not snapped to a named accent")
eq(cols[1].accentHex, undefined, "no hex leaves accentHex unset so the named accent applies")
eq(cols[0].tasks.length, 1, "steps land in their column")
eq(cols[1].tasks.length, 0, "an empty column is kept, not dropped")

/* -------------------------------------------------------------- footnotes */

eq(toFootnotes(base as never, { statusMap }), [], "a bare step carries no counters at all")

eq(
  toFootnotes({ ...base, estimated_hours: 4 } as never, { statusMap }),
  [{ label: "4h", title: "Estimated hours" }],
  "a numeric estimate becomes one counter",
)
eq(
  toFootnotes({ ...base, estimated_hours: "2.5" } as never, { statusMap }),
  [{ label: "2.5h", title: "Estimated hours" }],
  "estimated_hours arrives from pg as a string and still works",
)
eq(
  toFootnotes({ ...base, estimated_hours: 0 } as never, { statusMap }),
  [],
  "a zero estimate is not worth a counter",
)
eq(
  toFootnotes({ ...base, estimated_hours: "not a number" } as never, { statusMap }),
  [],
  "an unparseable estimate is dropped, not rendered as NaNh",
)

eq(
  toFootnotes({ ...base, tasks: ["a", { title: "b", done: true }] } as never, { statusMap }),
  [{ label: "✓ 1/2", title: "Checklist" }],
  "checklist counts the legacy string form and the object form together",
)

eq(
  toFootnotes({ ...base, dependencies: [{ depends_on_step_id: "x", dependency_type: "hard" }] } as never, {
    statusMap,
  }),
  [{ label: "⇄ 1", title: "Dependencies" }],
  "dependencies get a counter",
)

eq(
  toFootnotes(base as never, {
    statusMap,
    subtasksOf: () => [{ ...base, id: "a", status: "shipped" }, { ...base, id: "b", status: "todo" }] as never,
  }),
  [{ label: "1/2 subtasks", title: "Subtasks" }],
  "subtasks are counted by status kind, not by a flag",
)

eq(
  toFootnotes(
    { ...base, estimated_hours: 3, tasks: ["a"], dependencies: [{ depends_on_step_id: "x", dependency_type: "hard" }] } as never,
    { statusMap, subtasksOf: () => [{ ...base, id: "a", status: "todo" }] as never },
  ).map((f) => f.label),
  ["3h", "0/1 subtasks", "✓ 0/1", "⇄ 1"],
  "counters keep a stable order: estimate, subtasks, checklist, dependencies",
)

/* ------------------------------------------------------------ tags / done */

eq(
  toKanbanTask(base as never, { statusMap, today: TODAY }).tags?.map((t) => t.label),
  ["ignored-second-tag"],
  "the first tag is the category chip, the rest become pills",
)
eq(
  toKanbanTask({ ...base, tags: ["only"] } as never, { statusMap, today: TODAY }).tags,
  [],
  "a single tag leaves no pills — it is already the chip",
)
eq(
  typeof toKanbanTask({ ...base, tags: ["a", "b"] } as never, { statusMap, today: TODAY }).tags?.[0].color,
  "string",
  "pills carry a resolved colour",
)
eq(toKanbanTask(base as never, { statusMap, today: TODAY }).done, false, "open step is not struck through")
eq(
  toKanbanTask({ ...base, status: "shipped" } as never, { statusMap, today: TODAY }).done,
  true,
  "done step is struck through",
)

/* ------------------------------------------------- what a card is and who holds it (2026-11-16) */
{
  const NOW = new Date("2026-11-16T12:00:00Z")
  const at = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
  const card = (over: Record<string, unknown>) => toKanbanTask({ ...base, ...over } as never, { statusMap, today: NOW })
  eq(card({ work_kind: "upkeep", tags: ["x"] }).category, "Upkeep", "an upkeep card says so where a tag would be")
  eq(card({ work_kind: "initiative", metadata: { work: { type: "campaign" } } }).category, "Campaign", "an initiative says which kind")
  eq(card({ work_kind: "initiative" }).kind, "Phase", "an initiative's kind is drawn on the card")
  eq(card({ work_kind: "upkeep" }).kind, "Upkeep", "an upkeep card's kind is drawn on the card")
  eq(card({ work_kind: "task", tags: ["x"] }).kind, undefined, "a plain task draws no kind")
  eq(toKanbanTask({ ...base, project_name: "BYB Society" } as BoardStep, { statusMap: {}, showProject: true }).footnotes?.[0]?.label, "BYB Society", "on the all-projects board a card names its project first")
  eq((toKanbanTask(base as BoardStep, { statusMap: {} }).footnotes ?? []).some((f) => f.title === "The project this card belongs to"), false, "a project's own board does not repeat the project")
  eq(card({ status: "in-progress", claimed_by_id: "claude-code", claimed_at: at(5) }).assignees, [{ name: "claude-code" }], "in progress shows the agent holding it")
  eq(card({ status: "in-progress", claimed_by_id: "claude-code", claimed_at: at(5) }).footnotes?.[0]?.label, "With claude-code", "and says so in words")
  eq(card({ status: "in-progress", metadata: { work: { sentAt: at(3) } } }).footnotes?.[0]?.label, "Sent, waiting for an agent", "sent and not yet picked up")
  eq(card({ status: "in-progress", assigned_agent: null }).footnotes?.[0]?.label, "Nobody holds it", "in progress with nobody holding it says so")
  eq(card({ status: "pending" }).footnotes?.some((f) => /Sent|Nobody|With /.test(f.label)), false, "nothing is said outside In progress")
  eq(card({ status: "pending", in_line: true } as never).footnotes?.[0]?.label, "In line for an agent", "a started card in Up next says it is in line")
  eq(card({ status: "pending", in_line: false } as never).footnotes?.some((f) => /In line/.test(f.label)), false, "a card nobody started says nothing")
  eq(card({ status: "in-progress", claimed_by_id: "claude-code", claimed_at: at(5), in_line: true } as never).footnotes?.[0]?.label, "With claude-code", "once taken, who holds it wins")
  eq(card({ status: "pending", assigned_agent: "claude" }).assignees, [{ name: "claude" }], "elsewhere the assigned agent stays")
}


// Subtasks shown in place on the card (owner's pick 2026-11-17): each with its title and whether it is done.
{
  const parent = { id: "p", title: "Parent", status: "pending" } as never
  const kids = [{ id: "a", title: "First", status: "completed" }, { id: "b", title: "Second", status: "pending" }] as never[]
  const list = toSubtaskList(parent, { subtasksOf: (id: string) => (id === "p" ? kids : []), statusMap: { completed: { kind: "done" }, pending: { kind: "open" } } } as never)
  eq(list, [{ id: "a", title: "First", done: true }, { id: "b", title: "Second", done: false }], "a card lists its subtasks with whether each is done")
  eq(toSubtaskList({ id: "x", title: "Lone", status: "pending" } as never, { subtasksOf: () => [], statusMap: {} } as never), [], "a card without subtasks lists none")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

