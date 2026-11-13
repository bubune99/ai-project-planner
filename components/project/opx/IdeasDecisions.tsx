"use client"

/*
 * Ideas & decisions (owner 2026-11-13). One place for an idea's whole life:
 *   Pipeline: Ideas → Exploring → Waiting on you → Decided, each decision
 *             showing the tasks it produced.
 *   Timeline: the project's change log (decided, shipped, ideas, flow changes,
 *             questions), newest first.
 *   Idea page: the plan already written into the idea, ready to iterate.
 *   Decision page: options side by side, chosen vs considered, kept as history.
 *
 * Options are stored as the alternatives of a reasoning node
 * (mlp_why_nodes.alternatives), which already exists; each save adds a node,
 * so earlier comparisons stay on record.
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { parseIdeaPlan, ideaStage, ideasForProject } from "@/lib/project-views/ideas"
import { TIMELINE_KINDS, KIND_COLOR, buildTimeline, byMonth, type TimelineKind } from "@/lib/project-views/timeline"
import { Failed, Loading, Md, Seg, ago, askAssistant, fmtDate, unwrap, useHoverTip, useJson } from "./shared"

interface Decision { id: string; title: string; summary?: string | null; status?: string | null; tags?: string[] | null; createdAt?: string | null; nodeCount?: number }
interface Idea { id: string; title: string; description?: string | null; category?: string | null; lifecycle?: string | null; createdAt?: string | null; updatedAt?: string | null; facetCount?: number; promotedToProjectId?: string | null }
interface Question { id: string; question: string; options: string[]; context?: string | null; projectId?: string | null; askedAt?: string | null }
interface Step { id: string; title: string; description?: string | null; completed_at?: string | null; is_subtask?: boolean | null }
interface Doc { id: string; title: string; content?: string | null; updated_at?: string | null }
export interface DecisionOption { name: string; note?: string; pros: string[]; cons: string[]; chosen?: boolean; image?: string; meets?: boolean[] }

/** Tasks whose titles share two or more long words with the decision. A guess until decisions link to tasks. */
function linkedSteps(d: Decision, steps: Step[]) {
  const words = d.title.toLowerCase().split(/\W+/).filter((w) => w.length > 5)
  if (!words.length) return []
  return steps.filter((s) => words.filter((w) => s.title.toLowerCase().includes(w)).length >= 2)
}

export function IdeasDecisions({ projectId, projectName }: { projectId: string; projectName: string }) {
  const why = useJson(`/api/memory/why?projectId=${projectId}&limit=100`)
  const inbox = useJson(`/api/inbox`)
  const ideasQ = useJson(`/api/ideas`)
  const stepsQ = useJson(`/api/projects/${projectId}/steps`)
  const docsQ = useJson(`/api/projects/${projectId}/documents`)
  const [mode, setMode] = useState<"pipeline" | "timeline">("pipeline")
  const [openIdea, setOpenIdea] = useState<string | null>(null)
  const [openDec, setOpenDec] = useState<string | null>(null)
  const [answered, setAnswered] = useState<Record<string, string>>({})
  const { tipProps, node } = useHoverTip()

  const decisions = useMemo(() => (unwrap<Decision[]>(why.data) || []).slice().sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0)), [why.data])
  const questions = useMemo(() => (unwrap<Question[]>(inbox.data) || []).filter((q) => q.projectId === projectId), [inbox.data, projectId])
  const ideas = useMemo(() => ideasForProject(unwrap<Idea[]>(ideasQ.data) || [], projectId, projectName), [ideasQ.data, projectId, projectName])
  const steps = useMemo(() => unwrap<Step[]>(stepsQ.data, "steps") || [], [stepsQ.data])
  const docs = useMemo(() => unwrap<Doc[]>(docsQ.data, "documents") || [], [docsQ.data])

  if (why.loading && !why.data) return <Loading what="ideas and decisions" />
  if (why.error) return <Failed what="decisions" error={why.error} retry={why.reload} />

  if (openIdea) return <IdeaPage id={openIdea} onBack={() => setOpenIdea(null)} onChanged={ideasQ.reload} />
  if (openDec) {
    const d = decisions.find((x) => x.id === openDec)
    if (d) return <DecisionPage decision={d} steps={linkedSteps(d, steps)} onBack={() => setOpenDec(null)} />
  }

  const answer = async (q: Question, option: string) => {
    setAnswered((a) => ({ ...a, [q.id]: option }))
    try {
      const r = await fetch(`/api/inbox/${q.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
      toast.success(`Answered: ${option}`)
      inbox.reload()
    } catch (e) {
      setAnswered((a) => { const { [q.id]: _, ...rest } = a; return rest })
      toast.error(e instanceof Error ? e.message : "Couldn't save the answer")
    }
  }

  const switcher = <Seg label="Ideas and decisions view" value={mode} onChange={setMode} options={[["pipeline", "Pipeline"], ["timeline", "Timeline"]]} />

  if (mode === "timeline") {
    return <ChangeLog decisions={decisions} steps={steps} ideas={ideas} docs={docs} questions={questions} switcher={switcher} onOpenDecision={setOpenDec} onOpenIdea={setOpenIdea} />
  }

  const seed = ideas.filter((i) => ideaStage(i.lifecycle) === "idea")
  const exploring = ideas.filter((i) => ideaStage(i.lifecycle) === "exploring")
  const ideaCard = (i: Idea) => (
    <button key={i.id} className="opx-pcard" onClick={() => setOpenIdea(i.id)} {...tipProps(i.description)}>
      <b>{i.title}</b>
      <span className="opx-meta"><span>{i.category || "idea"}</span>{i.facetCount ? <span>{i.facetCount} notes</span> : null}<span>{ago(i.createdAt)}</span></span>
    </button>
  )
  const col = (title: string, hint: string, color: string, n: number, body: React.ReactNode) => (
    <div className="opx-pcol">
      <div className="opx-row" style={{ fontWeight: 600, fontSize: 15 }}><i className="opx-dot" style={{ background: color }} />{title}<span className="opx-n">{n}</span></div>
      <div className="opx-muted" style={{ fontSize: 12.5, margin: "2px 0 10px" }}>{hint}</div>
      {body}
      {n === 0 && <p className="opx-muted" style={{ fontSize: 13 }}>Nothing here.</p>}
    </div>
  )

  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <div className="opx-row"><span className="opx-muted" style={{ fontSize: 13 }}>An idea moves right as it firms up: explore it, answer the question, record the decision, then turn it into tasks.</span><span style={{ marginLeft: "auto" }}>{switcher}</span></div>
      <div className="opx-pipe">
        {col("Ideas", "Raw thoughts, nothing committed", "#8a94a3", seed.length, seed.map(ideaCard))}
        {col("Exploring", "Being researched or shaped", "var(--opx-accent)", exploring.length, exploring.map(ideaCard))}
        {col("Waiting on you", "A choice only you can make", "var(--opx-warn)", questions.length, questions.map((q) => (
          <div key={q.id} className="opx-pcard" style={{ cursor: "default" }}>
            <b>{q.question}</b>
            {q.context && <p className="opx-muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>{q.context.replace(/\[[a-z-]+:[^\]]+\]/g, "").slice(0, 220)}</p>}
            <span className="opx-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {q.options.map((o, k) => (
                <button key={o} className={`opx-btn sm${k === 0 ? " primary" : ""}`} disabled={!!answered[q.id]} onClick={() => answer(q, o)}>{answered[q.id] === o ? `✓ ${o}` : o}</button>
              ))}
            </span>
          </div>
        )))}
        {col("Decided", "Committed, with the reason kept", "var(--opx-good)", decisions.length, decisions.map((d) => {
          const L = linkedSteps(d, steps)
          return (
            <button key={d.id} className="opx-pcard" onClick={() => setOpenDec(d.id)} {...tipProps(d.summary)}>
              <b>{d.title}</b>
              <span className="opx-meta">
                <span>{ago(d.createdAt)}</span>
                {(d.tags || []).slice(0, 2).map((t) => <span key={t}>#{t}</span>)}
                <span style={{ color: L.length ? "var(--opx-accent)" : undefined }}>{L.length ? `${L.length} task${L.length > 1 ? "s" : ""}` : "No tasks yet"}</span>
              </span>
            </button>
          )
        }))}
      </div>
      <p className="opx-muted" style={{ fontSize: 12.5, margin: 0 }}>Ideas are matched to this project by its name until ideas can be linked to projects. Task counts on decisions are matched by title.</p>
      {node}
    </div>
  )
}

// ─── Change log ─────────────────────────────────────────────────────────────

function ChangeLog({ decisions, steps, ideas, docs, questions, switcher, onOpenDecision, onOpenIdea }: {
  decisions: Decision[]; steps: Step[]; ideas: Idea[]; docs: Doc[]; questions: Question[]; switcher: React.ReactNode
  onOpenDecision: (id: string) => void; onOpenIdea: (id: string) => void
}) {
  const [filter, setFilter] = useState<TimelineKind | "all">("all")
  const [open, setOpen] = useState<string | null>(null)
  const events = useMemo(() => buildTimeline({
    decisions, steps, ideas, docs,
    questions: questions.map((q) => ({ id: q.id, question: q.question, context: q.context, createdAt: q.askedAt })),
  }), [decisions, steps, ideas, docs, questions])
  const shown = events.filter((e) => filter === "all" || e.kind === filter)
  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <div className="opx-row"><span className="opx-muted" style={{ fontSize: 13 }}>Everything this project decided, shipped and changed, newest first. Click an entry for the full context.</span><span style={{ marginLeft: "auto" }}>{switcher}</span></div>
      <div className="opx-tlwrap">
        <aside className="opx-sec opx-sticky">
          <div className="opx-sech"><h2>Show</h2></div>
          <button className={`opx-dc${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>Everything <em>{events.length}</em></button>
          {TIMELINE_KINDS.map((k) => (
            <button key={k} className={`opx-dc${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>
              <span className="opx-row" style={{ gap: 8 }}><i className="opx-dot" style={{ background: KIND_COLOR[k] }} />{k}</span><em>{events.filter((e) => e.kind === k).length}</em>
            </button>
          ))}
          <p className="opx-muted" style={{ fontSize: 12.5, margin: "12px 4px 0" }}>"Shipped" is a task marked done. Work that shipped without its task being closed doesn't show here.</p>
        </aside>
        <section className="opx-sec" style={{ padding: "8px 24px 24px" }}>
          {shown.length === 0 && <div className="opx-empty" style={{ marginTop: 16 }}>Nothing yet.</div>}
          {byMonth(shown).map(({ month, events: list }) => (
            <div key={month}>
              <div className="opx-tlm">{month}</div>
              {list.map((e) => {
                const key = `${e.kind}:${e.ref?.id}:${e.at}`
                const isOpen = open === key
                const d = new Date(e.at)
                return (
                  <div key={key} className={`opx-tle${isOpen ? " open" : ""}`} role="button" tabIndex={0} aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : key)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpen(isOpen ? null : key) } }}>
                    <div className="opx-tld"><b>{d.getDate()}</b><small>{fmtDate(d, { weekday: "short" })}</small></div>
                    <div className="opx-tlx"><i style={{ background: KIND_COLOR[e.kind] }} /></div>
                    <div className="opx-tlb">
                      <div style={{ fontSize: 12, fontWeight: 600, color: KIND_COLOR[e.kind] }}>{e.kind}</div>
                      <b>{e.title}</b>
                      {e.summary && <p>{isOpen ? e.summary.slice(0, 1200) : e.summary.length > 220 ? `${e.summary.slice(0, 219)}…` : e.summary}</p>}
                      {e.tags.length > 0 && <span className="opx-meta" style={{ marginTop: 6 }}>{e.tags.slice(0, 4).map((t) => <span key={t}>#{t}</span>)}</span>}
                      {isOpen && (e.ref?.type === "decision" || e.ref?.type === "idea") && (
                        <span className="opx-row" style={{ gap: 6, marginTop: 10 }}>
                          {e.ref.type === "decision" && <button className="opx-btn sm" onClick={(ev) => { ev.stopPropagation(); onOpenDecision(e.ref!.id) }}>Open decision</button>}
                          {e.ref.type === "idea" && <button className="opx-btn sm" onClick={(ev) => { ev.stopPropagation(); onOpenIdea(e.ref!.id) }}>Open idea</button>}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

// ─── Idea page ──────────────────────────────────────────────────────────────

function IdeaPage({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const q = useJson(`/api/ideas/${id}`)
  const [saving, setSaving] = useState(false)
  if (q.loading && !q.data) return <Loading what="the idea" />
  if (q.error) return <Failed what="the idea" error={q.error} retry={q.reload} />
  const idea = unwrap<any>(q.data) || {}
  const plan = parseIdeaPlan(idea.description)
  const facets: { id: string; name: string; data?: Record<string, unknown> }[] = idea.facets || []
  const lifecycle: string = idea.lifecycle || "seed"
  const human = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  const setStage = async (next: string) => {
    if (next === lifecycle) return
    setSaving(true)
    try {
      const r = await fetch(`/api/ideas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lifecycle: next }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
      q.reload(); onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change the stage") }
    finally { setSaving(false) }
  }
  const ask = (what: string) => askAssistant(`For the idea "${idea.title}" (idea ${id}): ${what}`)
  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <button className="opx-link" style={{ alignSelf: "flex-start", padding: 0 }} onClick={onBack}>‹ Ideas & decisions</button>
      <section className="opx-sec">
        <div className="opx-row" style={{ alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="opx-muted" style={{ fontSize: 12.5 }}>{idea.category || "idea"} · started {ago(idea.createdAt)} · last changed {ago(idea.updatedAt)}</div>
            <h1 style={{ fontSize: 30, margin: "6px 0 10px", fontWeight: 600 }}>{idea.title}</h1>
            {plan.intro && <Md text={plan.intro} />}
          </div>
          <div className="opx-seg" role="radiogroup" aria-label="Stage">
            {([["seed", "Idea"], ["exploring", "Exploring"], ["refined", "Ready to decide"]] as const).map(([k, l]) => (
              <button key={k} role="radio" aria-checked={lifecycle === k} disabled={saving} className={lifecycle === k ? "on" : ""} onClick={() => setStage(k)}>{l}</button>
            ))}
          </div>
        </div>
      </section>
      <div className="opx-iw">
        <section className="opx-sec">
          <div className="opx-sech"><h2>Features</h2><span className="opx-n">{plan.features.length}</span><button className="opx-link" style={{ marginLeft: "auto" }} onClick={() => ask("add a feature. Ask me what it is, then update the idea's description with it as a new numbered layer.")}>＋ Add a feature</button></div>
          {plan.features.length === 0 && <div className="opx-empty">No features yet. Ask the assistant to break the idea down into features, or add the first one.</div>}
          {plan.features.map((f, k) => (
            <div key={f.name} className="opx-feat">
              <div className="opx-row"><span className="opx-fnum">{k + 1}</span><b style={{ fontSize: 17 }}>{f.name}</b><span className="opx-muted" style={{ marginLeft: "auto", fontSize: 12.5 }}>{f.needs.length ? `${f.needs.length} needs` : "Not broken down yet"}</span></div>
              <p>{f.summary}</p>
              {f.needs.length > 0 && <ul className="opx-needs">{f.needs.map((n) => <li key={n}>{n}</li>)}</ul>}
              <span className="opx-row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button className="opx-btn sm" onClick={() => ask(`flesh out the "${f.name}" feature: what it needs, open questions, and risks. Show me before changing the idea.`)}>Flesh out with the assistant</button>
                <button className="opx-btn sm" onClick={() => ask(`I have a question to decide about the "${f.name}" feature. Help me phrase it with options and send it to my inbox.`)}>Ask a question</button>
                <button className="opx-btn sm" onClick={() => ask(`compare options for the "${f.name}" feature and record them as a decision with the alternatives side by side.`)}>Compare options</button>
                <button className="opx-btn sm" onClick={() => ask(`turn the "${f.name}" feature into project tasks, one per need. Show me the list before creating them.`)}>Make tasks</button>
              </span>
            </div>
          ))}
        </section>
        <div className="opx-col" style={{ gap: 12 }}>
          {plan.order.length > 0 && (
            <section className="opx-sec"><div className="opx-sech"><h2>Suggested order</h2></div><ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>{plan.order.map((o) => <li key={o}>{o}</li>)}</ol></section>
          )}
          <section className="opx-sec">
            <div className="opx-sech"><h2>Notes</h2><span className="opx-n">{facets.length}</span></div>
            {facets.length === 0 && <p className="opx-muted" style={{ margin: 0 }}>No notes yet.</p>}
            {facets.map((f) => (
              <div key={f.id} className="opx-note">
                <b>{f.name}</b>
                {Object.entries(f.data || {}).map(([k, v]) => (
                  <div key={k}><small className="opx-muted">{human(k)}</small><p>{typeof v === "string" ? v : JSON.stringify(v)}</p></div>
                ))}
              </div>
            ))}
          </section>
          <section className="opx-sec">
            <div className="opx-sech"><h2>Next</h2></div>
            <span className="opx-row" style={{ gap: 6, flexWrap: "wrap" }}>
              <a className="opx-btn" href={`/ideas/${id}`}>Open the canvas</a>
              <button className="opx-btn" onClick={() => ask("record a decision for this idea: what we're doing and why, with the options we weighed.")}>Make a decision</button>
            </span>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Decision page ──────────────────────────────────────────────────────────

function DecisionPage({ decision, steps, onBack }: { decision: Decision; steps: Step[]; onBack: () => void }) {
  const q = useJson(`/api/memory/why/${decision.id}`)
  const [draft, setDraft] = useState<{ criteria: string[]; options: DecisionOption[] } | null>(null)
  const [saving, setSaving] = useState(false)
  if (q.loading && !q.data) return <Loading what="the decision" />
  const d = unwrap<any>(q.data) || {}
  const nodes: { reasoning: string; alternatives: DecisionOption[]; constraints: string[]; createdAt: string }[] = d.nodes || []
  const latest = [...nodes].reverse().find((n) => (n.alternatives || []).length > 0)
  const criteria = latest?.constraints || []
  const options = (latest?.alternatives || []).map((o) => ({ ...o, pros: o.pros || [], cons: o.cons || [] }))
  const save = async () => {
    if (!draft) return
    const opts = draft.options.filter((o) => o.name.trim())
    if (!opts.length) { toast.error("Add at least one option"); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/memory/why/${decision.id}/nodes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasoning: `Options compared on ${new Date().toLocaleDateString("en-US")}`, alternatives: opts, constraints: draft.criteria.filter((c) => c.trim()) }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
      toast.success("Options saved"); setDraft(null); q.reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the options") }
    finally { setSaving(false) }
  }
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean)
  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <button className="opx-link" style={{ alignSelf: "flex-start", padding: 0 }} onClick={onBack}>‹ Ideas & decisions</button>
      <section className="opx-sec">
        <div className="opx-muted" style={{ fontSize: 12.5 }}>Decided {fmtDate(decision.createdAt, { month: "long", day: "numeric", year: "numeric" })}{decision.status ? ` · ${decision.status}` : ""}</div>
        <h1 style={{ fontSize: 30, margin: "6px 0 10px", fontWeight: 600 }}>{decision.title}</h1>
        {decision.summary && <Md text={decision.summary} />}
        {criteria.length > 0 && <div className="opx-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}><span className="opx-muted" style={{ fontSize: 12.5 }}>Judged on</span>{criteria.map((c) => <span key={c} className="opx-chip">{c}</span>)}</div>}
      </section>

      {draft ? (
        <section className="opx-sec">
          <div className="opx-sech"><h2>Options you weighed</h2></div>
          <label className="opx-muted" style={{ fontSize: 12.5 }}>Judged on (one per line)</label>
          <textarea className="opx-input" rows={3} value={draft.criteria.join("\n")} onChange={(e) => setDraft({ ...draft, criteria: e.target.value.split("\n") })} />
          <div className="opx-optgrid" style={{ gridTemplateColumns: `repeat(${Math.max(1, draft.options.length)}, minmax(0,1fr))`, marginTop: 12 }}>
            {draft.options.map((o, i) => {
              const set = (patch: Partial<DecisionOption>) => setDraft({ ...draft, options: draft.options.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
              return (
                <div key={i} className="opx-opt-edit">
                  <input className="opx-input" placeholder="Option name" value={o.name} onChange={(e) => set({ name: e.target.value })} aria-label={`Option ${i + 1} name`} />
                  <input className="opx-input" placeholder="Picture link (optional)" value={o.image || ""} onChange={(e) => set({ image: e.target.value })} aria-label={`Option ${i + 1} picture link`} />
                  <textarea className="opx-input" rows={2} placeholder="Short note" value={o.note || ""} onChange={(e) => set({ note: e.target.value })} aria-label={`Option ${i + 1} note`} />
                  <textarea className="opx-input" rows={3} placeholder="Pros, one per line" value={o.pros.join("\n")} onChange={(e) => set({ pros: lines(e.target.value) })} aria-label={`Option ${i + 1} pros`} />
                  <textarea className="opx-input" rows={3} placeholder="Cons, one per line" value={o.cons.join("\n")} onChange={(e) => set({ cons: lines(e.target.value) })} aria-label={`Option ${i + 1} cons`} />
                  <label className="opx-row" style={{ fontSize: 13 }}><input type="radio" name="chosen" checked={!!o.chosen} onChange={() => setDraft({ ...draft, options: draft.options.map((x, k) => ({ ...x, chosen: k === i })) })} /> Chosen</label>
                  <button className="opx-btn sm danger" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, k) => k !== i) })}>Remove</button>
                </div>
              )
            })}
          </div>
          <span className="opx-row" style={{ gap: 8, marginTop: 12 }}>
            <button className="opx-btn" onClick={() => setDraft({ ...draft, options: [...draft.options, { name: "", pros: [], cons: [] }] })}>＋ Add an option</button>
            <button className="opx-btn" style={{ marginLeft: "auto" }} onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
            <button className="opx-btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save options"}</button>
          </span>
        </section>
      ) : options.length > 0 ? (
        <div className="opx-optgrid" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
          {options.map((o) => (
            <section key={o.name} className={`opx-opt${o.chosen ? " chosen" : ""}`}>
              {o.image ? <div className="opx-oimg" style={{ backgroundImage: `url("${o.image.replace(/"/g, "")}")` }} /> : null}
              <div style={{ padding: "18px 20px" }}>
                <div className="opx-row"><h2 style={{ fontSize: 18, margin: 0, fontWeight: 600 }}>{o.name}</h2><span className="opx-chip" style={{ marginLeft: "auto" }}>{o.chosen ? <><i className="opx-dot" style={{ background: "var(--opx-good)" }} />Chosen</> : "Considered"}</span></div>
                {o.note && <p className="opx-muted" style={{ margin: "6px 0 12px" }}>{o.note}</p>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13.5 }}>
                  <div>{o.pros.map((p) => <div key={p} style={{ color: "var(--opx-good)", marginBottom: 4 }}>＋ {p}</div>)}</div>
                  <div>{o.cons.map((c) => <div key={c} style={{ color: "var(--opx-hot)", marginBottom: 4 }}>－ {c}</div>)}</div>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="opx-sec"><p className="opx-muted" style={{ margin: 0 }}>No options were recorded for this decision. Add the alternatives you weighed so the record shows what was passed over and why.</p></section>
      )}

      {!draft && (
        <section className="opx-sec opx-row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="opx-btn" onClick={() => setDraft({ criteria: [...criteria], options: options.length ? options.map((o) => ({ ...o })) : [{ name: "", pros: [], cons: [] }, { name: "", pros: [], cons: [] }] })}>{options.length ? "Edit options" : "＋ Add the options you weighed"}</button>
          <button className="opx-btn" onClick={() => askAssistant(`Help me compare options for the decision "${decision.title}" (${decision.id}) and record them as alternatives with pros and cons.`)}>Compare with the assistant</button>
          <span className="opx-muted" style={{ marginLeft: "auto", fontSize: 13 }}>{steps.length ? `${steps.length} related task${steps.length > 1 ? "s" : ""}: ${steps.slice(0, 3).map((s) => s.title).join(" · ")}` : "No related tasks found."}</span>
        </section>
      )}
      {nodes.length > 1 && (
        <section className="opx-sec">
          <div className="opx-sech"><h2>History</h2><span className="opx-n">{nodes.length}</span></div>
          {[...nodes].reverse().map((n, i) => <div key={i} className="opx-row" style={{ padding: "6px 0", borderTop: i ? "1px solid var(--opx-line)" : 0, fontSize: 13.5 }}><span className="opx-muted" style={{ width: 120 }}>{fmtDate(n.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span><span>{n.reasoning}</span>{n.alternatives?.length ? <span className="opx-muted">· {n.alternatives.length} options</span> : null}</div>)}
        </section>
      )}
    </div>
  )
}
