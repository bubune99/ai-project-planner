/*
 * Agent run traces: what an agent did, when, and how it went.
 *
 * The server records a span for the agent run, every tool call, and every
 * delegated specialist (with that specialist's own tool calls nested under
 * it). Spans stream to the chat as they start and end, so the reply can show
 * live progress and a timeline of the run, and are saved with the message.
 *
 * Pure: the clock and the sink are injected. Assertions in trace.assert.ts.
 */

export type SpanKind = "agent" | "model" | "tool" | "io"
export type SpanStatus = "running" | "ok" | "error"

export interface AgentSpan {
  id: string
  /** Tool or agent name, e.g. list_projects. */
  label: string
  /** What a person reads: "Listing projects", "Asking the Researcher". */
  title: string
  kind: SpanKind
  status: SpanStatus
  /** Milliseconds from the start of the run. */
  start: number
  /** Null while running. */
  end: number | null
  parentId?: string
  /** One-line result: "38 projects", "Created", "Failed: not found". */
  detail?: string
  tokens?: number
}

export class TraceRecorder {
  private spans = new Map<string, AgentSpan>()
  private seq = 0
  private readonly t0: number

  constructor(
    private readonly runId: string,
    private readonly now: () => number,
    private readonly emit: (span: AgentSpan) => void = () => {},
  ) {
    this.t0 = now()
  }

  begin(input: { label: string; title: string; kind: SpanKind; parentId?: string }): string {
    const id = `${this.runId}-${++this.seq}`
    const span: AgentSpan = { id, ...input, status: "running", start: this.now() - this.t0, end: null }
    this.spans.set(id, span)
    this.emit({ ...span })
    return id
  }

  end(id: string, result: { status: "ok" | "error"; detail?: string; tokens?: number }): void {
    const s = this.spans.get(id)
    if (!s || s.end !== null) return
    const done: AgentSpan = { ...s, ...result, end: Math.max(s.start, this.now() - this.t0) }
    if (!done.detail) delete done.detail
    if (done.tokens == null) delete done.tokens
    this.spans.set(id, done)
    this.emit({ ...done })
  }

  /** Everything recorded so far, in start order. Spans still running stay open. */
  snapshot(): AgentSpan[] {
    return [...this.spans.values()].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
  }
}

// ── Wording ──────────────────────────────────────────────────────────────

const TITLES: Record<string, string> = {
  get_dashboard: "Checking the dashboard",
  project_workload: "Checking workload across projects",
  list_projects: "Listing projects",
  get_project_context: "Reading the project",
  get_project_tasks: "Reading tasks",
  list_phases: "Reading phases",
  get_execution_plan: "Reading the execution plan",
  list_documents: "Listing documents",
  read_document: "Reading a document",
  list_todos: "Listing todos",
  list_ideas: "Listing ideas",
  get_idea: "Reading an idea",
  list_decisions: "Listing decisions",
  search_memory: "Searching memory",
  global_search: "Searching everything",
  library_search: "Searching the library",
  find_attempts: "Checking past attempts",
  find_related: "Finding related items",
  get_agenda: "Checking the agenda",
  create_task: "Creating a task",
  update_task: "Updating a task",
  create_todo: "Adding a todo",
  create_decision: "Recording a decision",
  add_progress_note: "Posting a progress note",
  create_event: "Adding a calendar event",
  create_idea: "Capturing an idea",
  catalog_search: "Searching the catalog",
}

const sentence = (name: string) => {
  const s = name.replace(/_/g, " ").trim()
  return s ? s[0].toUpperCase() + s.slice(1) : name
}

/** A readable title for a tool call, with the subject when the input names one. */
export function toolTitle(name: string, input: unknown): string {
  const base = TITLES[name] ?? sentence(name)
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const subject = [i.query, i.search, i.title, i.name].find((v) => typeof v === "string" && v.trim()) as string | undefined
  if (!subject) return base
  const short = subject.length > 48 ? `${subject.slice(0, 47)}…` : subject
  return `${base}: “${short}”`
}

/** recentActivity / recent_activity → "recent activity". */
const humanKey = (k: string) => k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()

/** One line describing a tool's text result. Tools return compact JSON; errors start with "Error:". */
export function summarizeResult(text: unknown): { status: "ok" | "error"; detail?: string } {
  if (typeof text !== "string") return { status: "ok" }
  if (text.startsWith("Error:")) {
    const msg = text.slice(6).trim()
    return { status: "error", detail: `Failed: ${msg.length > 60 ? `${msg.slice(0, 59)}…` : msg}` }
  }
  let v: unknown
  try { v = JSON.parse(text) } catch { return { status: "ok" } }
  if (Array.isArray(v)) return { status: "ok", detail: `${v.length} result${v.length === 1 ? "" : "s"}` }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    if (o.created === true) return { status: "ok", detail: "Created" }
    if (o.updated === true) return { status: "ok", detail: "Updated" }
    for (const [k, val] of Object.entries(o)) {
      if (Array.isArray(val) && k !== "next_actions") {
        const noun = humanKey(k)
        return { status: "ok", detail: `${val.length} ${val.length === 1 ? noun.replace(/s$/, "") : noun}` }
      }
    }
  }
  return { status: "ok" }
}

export interface TraceTotals {
  tools: number
  errors: number
  /** Wall time of the run so far. */
  ms: number
  running: boolean
}

export function traceTotals(spans: AgentSpan[], nowMs?: number): TraceTotals {
  const tools = spans.filter((s) => s.kind !== "agent")
  const ends = spans.map((s) => s.end ?? nowMs ?? s.start)
  return {
    tools: tools.length,
    errors: spans.filter((s) => s.status === "error").length,
    ms: spans.length ? Math.max(...ends) - Math.min(...spans.map((s) => s.start)) : 0,
    running: spans.some((s) => s.status === "running"),
  }
}

export const formatMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`)

export interface LaidSpan extends AgentSpan {
  depth: number
}

/**
 * Rows for display: children directly under their parent, siblings by start
 * time. Orphans (parent not in the list) and cycles fall back to the top level
 * rather than disappearing.
 */
export function layoutSpans(spans: AgentSpan[]): LaidSpan[] {
  const ids = new Set(spans.map((s) => s.id))
  const kids = new Map<string, AgentSpan[]>()
  for (const s of spans) {
    const key = s.parentId && s.parentId !== s.id && ids.has(s.parentId) ? s.parentId : ""
    kids.set(key, [...(kids.get(key) ?? []), s])
  }
  const out: LaidSpan[] = []
  const seen = new Set<string>()
  const walk = (parent: string, depth: number) => {
    for (const s of [...(kids.get(parent) ?? [])].sort((a, b) => a.start - b.start)) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({ ...s, depth })
      walk(s.id, depth + 1)
    }
  }
  walk("", 0)
  for (const s of spans) if (!seen.has(s.id)) out.push({ ...s, depth: 0 })
  return out
}

/** Latest version of each span: data parts can repeat an id as a span starts then ends. */
export function latestSpans(parts: { type?: string; id?: string; data?: unknown }[]): AgentSpan[] {
  const byId = new Map<string, AgentSpan>()
  for (const p of parts) {
    if (p?.type !== "data-span" || !p.data || typeof p.data !== "object") continue
    const s = p.data as AgentSpan
    if (typeof s.id === "string") byId.set(s.id, s)
  }
  return [...byId.values()]
}
