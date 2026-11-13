/**
 * Executed checks for lib/project-views/*.
 * Run: npx -y tsx@4.23.15 lib/project-views/project-views.assert.ts
 */
import assert from "node:assert/strict"
import { type Plannable, rangeOf, byDay, dedupeTodos, unscheduled, monthCells, addDays, dayKey, dayOf, dayTicks } from "./schedule"
import { projectMetrics, weekOf, lastWeeks, medianLabel } from "./metrics"
import { parseIdeaPlan, featureName, ideaStage, ideasForProject } from "./ideas"
import { buildTimeline, byMonth, cleanSummary } from "./timeline"

let passed = 0
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log(`ok  ${name}`) }

ok("no dates means unscheduled, never a made-up span", () => {
  assert.equal(rangeOf({ id: "a", title: "x" }), null)
  const r = rangeOf({ id: "a", title: "x", end_date: "2026-11-20" })!
  assert.equal(dayKey(r.start), "2026-11-20")
  assert.equal(dayKey(r.end), "2026-11-20")
  const o = rangeOf({ id: "a", title: "x", metadata: { original_due_date: "2026-11-21T00:00:00Z" } })!
  assert.ok(o)
})

ok("start and due make a range; reversed dates are put in order", () => {
  const r = rangeOf({ id: "a", title: "x", start_date: "2026-11-16", end_date: "2026-11-23" })!
  assert.equal(dayKey(r.start), "2026-11-16"); assert.equal(dayKey(r.end), "2026-11-23")
  const rev = rangeOf({ id: "a", title: "x", start_date: "2026-11-23", end_date: "2026-11-16" })!
  assert.equal(dayKey(rev.start), "2026-11-16")
})

ok("a planned (unsaved) schedule wins; no due yet means one day", () => {
  const x = { id: "a", title: "x", end_date: "2026-01-01" }
  const r = rangeOf(x, { start: "2026-11-17", due: "" })!
  assert.equal(dayKey(r.start), "2026-11-17"); assert.equal(dayKey(r.end), "2026-11-17")
})

ok("a range shows on every day, restarting at each Sunday", () => {
  const m = byDay([{ item: { id: "a", title: "x" }, kind: "step" as const }], { a: { start: "2026-11-16", due: "2026-11-23" } })
  assert.equal(m.size, 8)
  assert.equal(m.get("2026-11-16")![0].first, true)
  assert.equal(m.get("2026-11-17")![0].first, false)
  assert.equal(m.get("2026-11-22")![0].first, true, "Sunday starts a new row")
  assert.equal(m.get("2026-11-23")![0].last, true)
  assert.equal(m.get("2026-11-16")![0].planned, true)
})

ok("dates survive the November clock change", () => {
  assert.equal(addDays("2026-10-31", 7), "2026-11-07")
  assert.equal(dayKey(dayOf("2026-11-02")!), "2026-11-02")
  const t = dayTicks(dayOf("2026-10-30")!, dayOf("2026-11-03")!)
  assert.deepEqual(t.map((x) => dayKey(x.date)), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"])
  assert.deepEqual(t.filter((x) => x.week).map((x) => dayKey(x.date)), ["2026-11-02"])
})

ok("month grid starts on the Sunday before the 1st and has 42 days", () => {
  const c = monthCells(2026, 10)
  assert.equal(c.length, 42)
  assert.equal(dayKey(c[0]), "2026-11-01")
  assert.equal(dayKey(monthCells(2026, 11)[0]), "2026-11-29")
})

ok("todo copies of steps are hidden, completed todos too", () => {
  const t = dedupeTodos([
    { title: "Register Stripe webhook", status: "pending" },
    { title: "register  stripe webhook ", status: "pending" },
    { title: "Owner security actions", status: "pending" },
    { title: "Done thing", status: "completed" },
    { title: "Linked", status: "pending", stepId: "s1" },
  ], ["Register Stripe webhook"])
  assert.deepEqual(t.map((x) => x.title), ["Owner security actions"])
})

ok("backlog: open undated items, urgent first", () => {
  const items: { item: Plannable; kind: "step" | "todo" }[] = [
    { item: { id: "1", title: "low", priority: "low" }, kind: "step" as const },
    { item: { id: "2", title: "urgent", priority: "urgent" }, kind: "step" as const },
    { item: { id: "3", title: "dated", end_date: "2026-11-20" }, kind: "step" as const },
    { item: { id: "4", title: "done", status: "completed" }, kind: "step" as const },
    { item: { id: "5", title: "planned" }, kind: "todo" as const },
  ]
  assert.deepEqual(unscheduled(items, { "5": { start: "2026-11-20", due: "" } }).map((x) => x.item.title), ["urgent", "low"])
})

ok("week keys match across the clock change", () => {
  const now = new Date(2026, 10, 13, 12)
  const w = lastWeeks(now, 3)
  assert.deepEqual(w, ["2026-10-26", "2026-11-02", "2026-11-09"])
  assert.equal(weekOf("2026-10-27T23:30:00"), "2026-10-26")
})

ok("metrics count real completions and ages", () => {
  const now = new Date(2026, 10, 13, 12)
  const m = projectMetrics([
    { status: "completed", created_at: "2026-10-01T10:00:00", completed_at: "2026-10-01T12:00:00" },
    { status: "completed", created_at: "2026-09-01T10:00:00", completed_at: "2026-11-10T10:00:00" },
    { status: "pending", created_at: "2026-11-10T10:00:00" },
    { status: "in-progress", created_at: "2026-06-01T10:00:00" },
    { status: "pending", created_at: "2026-06-01T10:00:00", deleted_at: "2026-07-01" },
  ], now)
  assert.equal(m.doneLast4, 1)
  assert.equal(m.open, 2)
  assert.equal(m.inProgress, 1)
  assert.deepEqual(m.ages.map((a) => a.count), [1, 0, 0, 1])
  assert.equal(m.weeks.at(-1)!.done, 1)
  assert.equal(m.weeks.at(-1)!.added, 1)
  assert.equal(dayKey(m.lastDone!), "2026-11-10")
  assert.equal(medianLabel(0.1), "Same day")
  assert.equal(medianLabel(1), "1 day")
  assert.equal(medianLabel(null), "—")
})

const BYB = `Owner 2026-11-10, after settling the three lanes (task 0215a105).

Layers on top of the lanes:
1. HOUSE DESIGNS: BYB's own graphics, sold on garments.
2. EDUCATION: workshops + blog teaching
   - garment quality;
   - the details of running the business;
3. DESIGNER MARKETPLACE: outside designers publish.
   Needs:
   - Stripe Connect (Express) payouts;
   - a revenue-share model;
4. CMS FOR OTHERS: license the platform.

Suggested order:
- lanes solid + custom pricing (revenue);
- then education;
Each gets a flow-first map before building.`

ok("idea plan: features, needs and order come from the text", () => {
  const p = parseIdeaPlan(BYB)
  assert.deepEqual(p.features.map((f) => f.name), ["House designs", "Education", "Designer marketplace", "CMS for others"])
  assert.deepEqual(p.features[1].needs, ["garment quality", "the details of running the business"])
  assert.deepEqual(p.features[2].needs, ["Stripe Connect (Express) payouts", "a revenue-share model"])
  assert.equal(p.features[3].needs.length, 0)
  assert.deepEqual(p.order, ["lanes solid + custom pricing (revenue)", "then education", "Each gets a flow-first map before building"])
  assert.ok(p.intro.startsWith("Owner 2026-11-10"))
  assert.equal(parseIdeaPlan("just a thought").features.length, 0)
  assert.equal(featureName("SEO AND AI TOOLS"), "Seo and AI tools".replace("Seo", "SEO"))
})

ok("idea stage and project matching", () => {
  assert.equal(ideaStage(null), "idea"); assert.equal(ideaStage("refined"), "exploring")
  const m = ideasForProject([{ title: "BYB: Canva" }, { title: "Bybus" }, { title: "x", promotedToProjectId: "p" }], "p", "BYB Society — Be Your Best")
  assert.deepEqual(m.map((i) => i.title), ["BYB: Canva", "x"])
})

ok("timeline: newest first, code blocks stripped, months grouped", () => {
  const ev = buildTimeline({
    decisions: [{ id: "d", title: "Grams", summary: "**Owner** said", createdAt: "2026-10-11T10:00:00Z", tags: ["weights"] }],
    steps: [{ id: "s", title: "Shipped it", completed_at: "2026-11-01T10:00:00Z" }, { id: "s2", title: "sub", completed_at: "2026-11-02T10:00:00Z", is_subtask: true }, { id: "s3", title: "open" }],
    ideas: [{ id: "i", title: "Idea", createdAt: "2026-11-10T10:00:00Z" }],
    docs: [{ id: "f", title: "Flow x", content: "Why\n```flow\n{\"a\":1}\n```\nend", updated_at: "2026-11-11T10:00:00Z" }, { id: "n", title: "Not a flow", updated_at: "2026-11-12T10:00:00Z" }],
    questions: [{ id: "q", question: "Merge?", created_at: "2026-11-13T10:00:00Z" }],
  })
  assert.deepEqual(ev.map((e) => e.kind), ["Asked you", "Flow changed", "Idea", "Shipped", "Decided"])
  assert.ok(!ev[1].summary.includes("{"))
  assert.equal(ev[4].summary, "Owner said")
  assert.deepEqual(byMonth(ev).map((m) => [m.month, m.events.length]), [["November 2026", 4], ["October 2026", 1]])
  assert.equal(cleanSummary("a [step:abc] b"), "a b")
})

console.log(`\n${passed} checks passed`)
