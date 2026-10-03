/* Run: npx -y tsx@4.23.15 lib/agents/trace.assert.ts */
import { TraceRecorder, toolTitle, summarizeResult, traceTotals, formatMs, layoutSpans, latestSpans, type AgentSpan } from "./trace"
let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }

let t = 1000
const emitted: AgentSpan[] = []
const rec = new TraceRecorder("r", () => t, (s) => emitted.push(s))
t = 1010; const root = rec.begin({ label: "jarvis", title: "JARVIS", kind: "agent" })
t = 1050; const a = rec.begin({ label: "list_projects", title: "Listing projects", kind: "tool", parentId: root })
t = 1300; rec.end(a, { status: "ok", detail: "38 projects" })
t = 1310; const d = rec.begin({ label: "researcher", title: "Asking the Researcher", kind: "agent", parentId: root })
t = 1320; const sub = rec.begin({ label: "search_memory", title: "Searching memory", kind: "tool", parentId: d })

eq("ids are run-prefixed and sequential", [root, a, d, sub], ["r-1", "r-2", "r-3", "r-4"])
eq("start is relative to the recorder's creation", rec.snapshot().map((s) => s.start), [10, 50, 310, 320])
eq("a running span has end null", rec.snapshot().find((s) => s.id === sub)!.end, null)
eq("ended span has end + detail", (({ end, detail, status }) => ({ end, detail, status }))(rec.snapshot().find((s) => s.id === a)!), { end: 300, detail: "38 projects", status: "ok" })
eq("every begin and end is emitted (live updates)", emitted.length, 5)
eq("emitted copies, not live references", emitted[1].end, null)
rec.end(a, { status: "error" })
eq("ending twice is ignored", rec.snapshot().find((s) => s.id === a)!.status, "ok")
rec.end("nope", { status: "ok" })
eq("ending an unknown id is ignored", rec.snapshot().length, 4)
t = 1200; const back = rec.begin({ label: "x", title: "x", kind: "tool" }); t = 1100; rec.end(back, { status: "ok" })
eq("end never precedes start (clock skew)", rec.snapshot().find((s) => s.id === back)!.end, 200)
eq("no undefined detail/tokens keys on an end without them", Object.keys(rec.snapshot().find((s) => s.id === back)!).includes("detail"), false)

eq("known tool title", toolTitle("list_projects", {}), "Listing projects")
eq("unknown tool humanised", toolTitle("compose_work_order", {}), "Compose work order")
eq("subject from query", toolTitle("search_memory", { query: "jev" }), "Searching memory: “jev”")
eq("long subject trimmed", toolTitle("create_task", { title: "x".repeat(60) }).endsWith("…”"), true)
eq("non-object input tolerated", toolTitle("list_projects", null), "Listing projects")

eq("array result", summarizeResult("[1,2,3]"), { status: "ok", detail: "3 results" })
eq("singular", summarizeResult("[1]"), { status: "ok", detail: "1 result" })
eq("created", summarizeResult('{"created":true,"id":"x"}'), { status: "ok", detail: "Created" })
eq("named list", summarizeResult('{"projects":[1,2],"count":2}'), { status: "ok", detail: "2 projects" })
eq("next_actions is not the result", summarizeResult('{"next_actions":[1],"tasks":[1,2,3]}'), { status: "ok", detail: "3 tasks" })
eq("error text", summarizeResult("Error: Project not found"), { status: "error", detail: "Failed: Project not found" })
eq("plain text is fine", summarizeResult("hello"), { status: "ok" })
eq("non-string tolerated", summarizeResult(undefined), { status: "ok" })

const spans: AgentSpan[] = [
  { id: "1", label: "j", title: "j", kind: "agent", status: "ok", start: 0, end: 900 },
  { id: "2", label: "t", title: "t", kind: "tool", status: "ok", start: 10, end: 200 },
  { id: "3", label: "u", title: "u", kind: "tool", status: "error", start: 220, end: 400 },
]
eq("totals", traceTotals(spans), { tools: 2, errors: 1, ms: 900, running: false })
eq("running run uses now", traceTotals([{ ...spans[0], status: "running", end: null }], 1500), { tools: 0, errors: 0, ms: 1500, running: true })
eq("empty", traceTotals([]), { tools: 0, errors: 0, ms: 0, running: false })
eq("formatMs", [formatMs(240), formatMs(6240), formatMs(12400)], ["240ms", "6.2s", "12s"])

const mk = (id: string, start: number, parentId?: string): AgentSpan => ({ id, label: id, title: id, kind: "tool", status: "ok", start, end: start + 1, ...(parentId ? { parentId } : {}) })
const laid = layoutSpans([mk("c", 30, "b"), mk("a", 0), mk("b", 20, "a"), mk("d", 10, "a"), mk("e", 40)])
eq("tree order: parent, then children by start", laid.map((s) => `${s.id}@${s.depth}`), ["a@0", "d@1", "b@1", "c@2", "e@0"])
eq("orphan goes to top level", layoutSpans([mk("x", 5, "missing")]).map((s) => `${s.id}@${s.depth}`), ["x@0"])
eq("self-parent tolerated", layoutSpans([mk("y", 0, "y")]).length, 1)
eq("latestSpans keeps the last version of each id", latestSpans([
  { type: "data-span", id: "1", data: { ...mk("1", 0), status: "running", end: null } },
  { type: "text" },
  { type: "data-span", id: "1", data: { ...mk("1", 0), status: "ok" } },
]).map((s) => s.status), ["ok"])

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
