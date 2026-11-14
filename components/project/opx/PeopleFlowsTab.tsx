"use client"

/*
 * People and flows tab: who the project is for, what they come to do, and
 * whether each step of that has been proved to work. Any text can be changed
 * in place; every change is saved and recorded. The second view draws how the
 * system works. Display only: states, scores, the meaning of a comparison row
 * and the record's wording come from lib/people.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  STEP_WORD, areaMeaning, cellKind, findControl, freshId, orphans, refOf, sameRef, scoreFlow, stepState,
  type ControlRef, type FlowDoc, type PageRecord, type Person, type Step, type StepState,
} from "@/lib/people/people-model"
import { buildProcessMap } from "@/lib/people/process-map"
import { shotAt, type Checklist, type Result, type Scorecard, type Summary, type View } from "@/lib/gates/gate-model"
import { Shots, type Piece } from "./ChecksTab"
import { Failed, Loading, Seg, ago, useJson } from "./shared"

const ProcessMap = dynamic(() => import("./ProcessMap").then((m) => m.ProcessMap), { ssr: false, loading: () => <Loading what="the drawing" /> })

interface LogEntry { version: number; actor: "owner" | "agent"; lines: string[]; at: string }
interface FlowsData { doc: FlowDoc; version: number; log: LogEntry[]; pages: { id: string; route: string; title: string | null }[]; canEdit: boolean }
interface PageData {
  id: string; route: string; checklist: Checklist; results: Result[]; images: { kind: "view" | "evidence"; key: string; url: string }[]
  summary: Summary; score?: Scorecard; yours?: unknown[]
}

/** Every scanned page of the project, by route: its checklist, its verdicts and its screenshots. */
function usePages(projectId: string, pages: FlowsData["pages"] | undefined) {
  const [byRoute, setByRoute] = useState<Record<string, PageData>>({})
  const ids = (pages ?? []).slice(0, 8).map((p) => p.id).join(",")
  useEffect(() => {
    if (!ids) return
    let off = false
    const load = () => Promise.all(ids.split(",").map((id) => fetch(`/api/projects/${projectId}/gates/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((all) => { if (!off) setByRoute(Object.fromEntries(all.filter(Boolean).map((p: PageData) => [p.route, p]))) })
    load()
    // Steps turn verified while agents work: refresh while the tab is in view.
    const t = setInterval(() => { if (document.visibilityState === "visible") load() }, 15000)
    return () => { off = true; clearInterval(t) }
  }, [projectId, ids])
  return byRoute
}

/** Text that can be changed where it stands. Leaving the field (or Enter) keeps what was typed. */
function Ed({ value, onSave, label, as: Tag = "span", hint, required, can }: { value: string; onSave: (v: string) => void; label: string; as?: "span" | "div" | "b" | "h3"; hint?: string; required?: boolean; can: boolean }) {
  if (!can) return <Tag className="opx-pf-ed off">{value || hint}</Tag>
  return (
    <Tag
      key={value} className="opx-pf-ed" role="textbox" aria-label={label} tabIndex={0} data-hint={hint ?? "Not known yet"}
      contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false}
      onBlur={(e) => { const v = e.currentTarget.innerText.replace(/\s+/g, " ").trim(); if (v === value) return; if (!v && required) { e.currentTarget.innerText = value; return } onSave(v) }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() } }}
    >{value}</Tag>
  )
}

const DOT: Record<StepState, string> = { unbuilt: "gap", missing: "gap", pending: "", flagged: "warn", failed: "bad", passed: "ok" }
const PERSON_FIELDS: [keyof Person, string][] = [
  ["background", "Who they are"], ["wants", "What they want"], ["context", "When and where they use it"],
  ["frustrations", "What gets in their way"], ["may", "What they may do"], ["mayNot", "What they may not"],
]

export function PeopleFlowsTab({ projectId }: { projectId: string }) {
  const flows = useJson<FlowsData>(`/api/projects/${projectId}/people`)
  const pagesByRoute = usePages(projectId, flows.data?.pages)
  const [doc, setDoc] = useState<FlowDoc | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [saving, setSaving] = useState<"" | "saving" | "saved">("")
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"people" | "map">("people")
  const [view, setView] = useState<"flow" | "page">("flow")
  const [personId, setPersonId] = useState<string | null>(null)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [route, setRoute] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const docRef = useRef<FlowDoc | null>(null), versionRef = useRef(-1), chain = useRef<Promise<void>>(Promise.resolve())
  const guides = useJson<{ guides: { name: string; kind: string; status: string; basis: string; checks: unknown[] }[] }>(tab === "map" ? `/api/gates/guides?projectId=${projectId}` : null)

  // Take the server's copy when it is first loaded, and again whenever it is a different version from ours.
  useEffect(() => {
    const d = flows.data
    if (!d || d.version === versionRef.current) return
    versionRef.current = d.version; docRef.current = d.doc
    setDoc(d.doc); setLog(d.log)
  }, [flows.data])

  const can = !!flows.data?.canEdit
  const reload = flows.reload
  /** Change the document: the page shows it at once, and it is saved in the order the changes were made. */
  const edit = useCallback((change: (d: FlowDoc) => void) => {
    if (!docRef.current) return
    const next: FlowDoc = structuredClone(docRef.current)
    change(next)
    docRef.current = next
    setDoc(next); setSaving("saving"); setError(null)
    chain.current = chain.current.then(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/people`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: docRef.current, baseVersion: versionRef.current }) })
        const j = await res.json().catch(() => null)
        if (!res.ok) throw Object.assign(new Error(j?.error || `Could not save (${res.status})`), { status: res.status })
        if (j.version !== versionRef.current) setLog((l) => [{ version: j.version, actor: j.actor === "agent" ? "agent" as const : "owner" as const, lines: j.lines, at: new Date().toISOString() }, ...l].slice(0, 40))
        versionRef.current = j.version
        setSaving("saved")
      } catch (e) {
        setSaving("")
        setError(e instanceof Error ? e.message : "Could not save")
        // Refused: what is on the page is not what is stored. Show what is stored.
        versionRef.current = -1
        reload()
      }
    })
  }, [projectId, reload])

  const records = useMemo(() => Object.fromEntries(Object.entries(pagesByRoute).map(([r, p]) => [r, { list: p.checklist, results: p.results } as PageRecord])), [pagesByRoute])
  const routes = flows.data?.pages.map((p) => p.route) ?? []
  const curRoute = route && routes.includes(route) ? route : routes[0] ?? null
  const curPage = curRoute ? pagesByRoute[curRoute] : undefined

  if (flows.loading && !doc) return <Loading what="people and flows" />
  if (flows.error && !doc) return <Failed what="people and flows" error={flows.error} retry={flows.reload} />
  if (!doc) return null

  const person = doc.people.find((p) => p.id === personId) ?? doc.people[0] ?? null
  const mine = person ? doc.flows.filter((f) => f.who === person.id) : []
  const flow = mine.find((f) => f.id === flowId) ?? mine[0] ?? null
  const ways = person ? doc.personas.filter((q) => q.who === person.id) : []
  const persona = ways.find((q) => q.id === personaId) ?? null
  const span = persona && flow ? persona.at[flow.id] : undefined
  const scores = doc.flows.map((f) => scoreFlow(records, f))
  const total = (k: "n" | "ok" | "gap") => scores.reduce((t, s) => t + s[k], 0)
  const loose = curPage ? orphans(curPage.route, curPage.checklist, doc) : []
  const allIds = () => [...doc.people, ...doc.personas, ...doc.flows, ...doc.areas, ...doc.flows.flatMap((f) => f.steps)].map((x) => x.id)
  const seed = Date.now() % 100000

  const imageOf = (page: PageData, key: string) => page.images.find((i) => i.kind === "view" && i.key === key)?.url
  const piecesOf = (page: PageData, v: View): Piece[] => (v.shots ?? []).flatMap((sh) => { const url = imageOf(page, `${v.key}@${sh.id}`); return url ? [{ ...sh, url }] : [] })
  /** A real screenshot cut around a control. A large card is shown from its top-left corner at a size that can be read. */
  const pictureOf = (ref: ControlRef | null | undefined, w = 420, h = 230): React.CSSProperties | null => {
    const page = ref ? pagesByRoute[ref.route] : undefined, hit = page && findControl(page.checklist, ref)
    if (!page || !hit) return null
    const { view, control: c } = hit, shot = shotAt(view, c.x + c.w / 2, c.y + c.h / 2), url = shot && imageOf(page, `${view.key}@${shot.id}`)
    if (!shot || !url) return null
    const cw = Math.min(c.w, 520), ch = Math.min(c.h, 260), z = Math.min(1, w / (cw + 200)), cx = shot.x + c.x - (shot.ax ?? 0) + cw / 2, cy = shot.y + c.y - shot.at + ch / 2
    return { backgroundImage: `url("${url}")`, backgroundSize: `${shot.vw * z}px ${shot.vh * z}px`, backgroundPosition: `${-(cx * z - w / 2)}px ${-(cy * z - h / 2)}px` }
  }
  /** Every control an agent has scanned, to point a step at. */
  const choices = Object.values(pagesByRoute).flatMap((p) => p.checklist.views.flatMap((v) => v.controls.map((c) => ({ ref: refOf(p.route, v, c), text: `${c.n}. ${c.label.slice(0, 44)} (${c.kind.toLowerCase()}${v.key === "page" ? "" : `, in ${v.name.replace("Opened by ", "").toLowerCase()}`})`, route: p.route }))))
  const controlPick = (value: ControlRef | null | undefined, label: string, onPick: (r: ControlRef | null) => void) => {
    const at = choices.findIndex((c) => sameRef(c.ref, value))
    return (
      <select className="opx-pf-pick" aria-label={label} disabled={!can} value={at >= 0 ? String(at) : value ? "gone" : ""} onChange={(e) => onPick(e.target.value === "" ? null : choices[Number(e.target.value)]?.ref ?? null)}>
        <option value="">Nothing on the page does this yet</option>
        {value && at < 0 && <option value="gone">{value.label} (not in the latest scan)</option>}
        {routes.map((r) => <optgroup key={r} label={r}>{choices.map((c, i) => (c.route === r ? <option key={i} value={i}>{c.text}</option> : null))}</optgroup>)}
      </select>
    )
  }

  const addPerson = () => edit((d) => { const id = freshId("p", allIds(), seed); d.people.push({ id, name: "New person", background: "", wants: "", context: "", frustrations: "", may: "", mayNot: "", basis: "Added by you." }); setPersonId(id); setFlowId(null); setPersonaId(null) })
  const addFlow = () => person && edit((d) => { const id = freshId("f", allIds(), seed); d.flows.push({ id, who: person.id, name: "New use case", lens: "", steps: [{ id: freshId("s", allIds(), seed + 1), does: "First step", expects: "", data: "", ref: null }] }); setFlowId(id) })
  const addWay = () => person && edit((d) => { const id = freshId("q", allIds(), seed); d.personas.push({ id, who: person.id, name: "New way of using it", habit: "", cares: "", at: {} }); setPersonaId(id) })
  const removePerson = (id: string) => edit((d) => {
    const gone = new Set(d.flows.filter((f) => f.who === id).map((f) => f.id)), ways = new Set(d.personas.filter((q) => q.who === id).map((q) => q.id))
    d.people = d.people.filter((p) => p.id !== id); d.flows = d.flows.filter((f) => !gone.has(f.id)); d.personas = d.personas.filter((q) => !ways.has(q.id))
    for (const a of d.areas) for (const k of Object.keys(a.does)) if (ways.has(k)) delete a.does[k]
    setRemoving(null); setPersonId(null)
  })
  const inFlow = (fn: (steps: Step[], d: FlowDoc) => void) => flow && edit((d) => { const f = d.flows.find((x) => x.id === flow.id); if (f) fn(f.steps, d) })
  /** Where the chosen persona starts or stops in this use case. Moving one end past the other moves both. */
  const setSpan = (i: number, end: 0 | 1) => persona && flow && edit((d) => {
    const q = d.personas.find((x) => x.id === persona.id); if (!q) return
    const cur = q.at[flow.id] ?? [i, i]
    q.at[flow.id] = end === 0 ? [i, Math.max(i, cur[1])] : [Math.min(i, cur[0]), i]
  })

  const flowView = () => {
    if (!person) return null
    if (!flow) return <p className="opx-muted">No use case is written for {person.name.toLowerCase()} yet. That is the first thing to settle.{can && <> <button type="button" className="opx-pf-add" onClick={addFlow}>Add a use case</button></>}</p>
    const states = flow.steps.map((s) => stepState(records, s))
    return (
      <div className="opx-pf-two">
        <div className="opx-pf-col">
          <h3 className="opx-pf-h">What they come to do</h3>
          {mine.map((f) => { const s = scoreFlow(records, f); return (
            <button type="button" key={f.id} className={`opx-pf-row${f.id === flow.id ? " on" : ""}`} onClick={() => setFlowId(f.id)}>
              <b>{f.name}</b>
              <small>{s.ok} of {s.n} steps verified{s.bad ? `, ${s.bad} failing` : ""}{s.gap ? `, ${s.gap} with nothing behind ${s.gap === 1 ? "it" : "them"}` : ""}</small>
              {s.n > 0 && <span className="opx-pf-bar"><i className="ok" style={{ width: `${(s.ok / s.n) * 100}%` }} /><i className="bad" style={{ width: `${(s.bad / s.n) * 100}%` }} /><i className="gap" style={{ width: `${(s.gap / s.n) * 100}%` }} /></span>}
            </button>
          ) })}
          {can && <button type="button" className="opx-pf-add" onClick={addFlow}>Add a use case</button>}
          <div className="opx-pf-box"><h4>Asking for a feature</h4><span className="opx-muted">Add a step where the new thing belongs and leave it pointing at nothing. It shows as not built, and counts against this use case until something on the page does it.</span></div>
        </div>
        <div className="opx-pf-flow">
          <div>
            <div className="opx-pf-head"><Ed as="h3" value={flow.name} label="Use case name" required can={can} onSave={(v) => edit((d) => { d.flows.find((x) => x.id === flow.id)!.name = v })} />
              {can && <button type="button" className="opx-btn sm" onClick={() => edit((d) => { d.flows = d.flows.filter((x) => x.id !== flow.id); for (const q of d.personas) delete q.at[flow.id]; setFlowId(null) })}>Remove this use case</button>}</div>
            <div className="opx-pf-lens"><small>Why {person.name.toLowerCase()} does this, and what they look for</small><Ed as="div" value={flow.lens} hint="Say how their background shapes what they want here." label="Why they do this" can={can} onSave={(v) => edit((d) => { d.flows.find((x) => x.id === flow.id)!.lens = v })} /></div>
            <div className="opx-pf-ways"><small>Seen as</small>
              {ways.map((q) => <button type="button" key={q.id} className={`opx-pf-way${q.id === persona?.id ? " on" : ""}`} onClick={() => setPersonaId(q.id)}>{q.name}</button>)}
              <button type="button" className={`opx-pf-way${!persona ? " on" : ""}`} onClick={() => setPersonaId(null)}>Everyone</button>
              {can && <button type="button" className="opx-pf-add" onClick={addWay}>Add a way of using it</button>}
            </div>
            {persona && (
              <div className="opx-pf-persona">
                <Ed as="b" value={persona.name} label="Persona name" required can={can} onSave={(v) => edit((d) => { d.personas.find((x) => x.id === persona.id)!.name = v })} />
                <span><small>Habit</small><Ed value={persona.habit} hint="How and how often they use it" label="Habit" can={can} onSave={(v) => edit((d) => { d.personas.find((x) => x.id === persona.id)!.habit = v })} /></span>
                <span><small>Cares about</small><Ed value={persona.cares} hint="The one thing they are here for" label="What they care about" can={can} onSave={(v) => edit((d) => { d.personas.find((x) => x.id === persona.id)!.cares = v })} /></span>
                <span className="opx-muted">{span ? `Starts at step ${span[0] + 1}, usually stops at step ${span[1] + 1}.` : "Where they start and stop in this use case is not set. Use the buttons on a step."}</span>
                {can && <button type="button" className="opx-btn sm" onClick={() => edit((d) => { d.personas = d.personas.filter((x) => x.id !== persona.id); for (const a of d.areas) delete a.does[persona.id]; setPersonaId(null) })}>Remove</button>}
              </div>
            )}
          </div>
          <div className="opx-pf-steps">
            {flow.steps.map((s, i) => {
              const st = states[i], pic = pictureOf(s.ref), out = !!span && (i < span[0] || i > span[1])
              const set = (k: "does" | "expects" | "data") => (v: string) => inFlow((steps) => { steps[i][k] = v })
              return (
                <div key={s.id} className={`opx-pf-step${out ? " out" : ""}${st === "unbuilt" ? " fresh" : ""}`}>
                  <div className="opx-pf-pic" style={pic ?? undefined}>{pic ? null : st === "unbuilt" ? "Not built yet" : st === "missing" ? "Not in the latest scan" : "No screenshot of this step yet"}</div>
                  <div className="opx-pf-shead"><span className="opx-pf-num">{i + 1}</span><Ed as="b" value={s.does} label={`Step ${i + 1}: what they do`} required can={can} onSave={set("does")} />
                    {span && i === span[0] && <span className="opx-pf-tag">Starts here</span>}{span && i === span[1] && <span className="opx-pf-tag">Usually stops here</span>}</div>
                  <div><small>Expects</small><Ed as="div" value={s.expects} hint="What they expect to happen" label={`Step ${i + 1}: what they expect`} can={can} onSave={set("expects")} /></div>
                  <div><small>Its content</small><Ed as="div" value={s.data} hint="Typed in, worked out, or an action" label={`Step ${i + 1}: where its content comes from`} can={can} onSave={set("data")} /></div>
                  <div><small>What on the page does it</small>{controlPick(s.ref, `Step ${i + 1}: the control that does it`, (r) => inFlow((steps) => { steps[i].ref = r }))}</div>
                  {can && (
                    <div className="opx-pf-tools">
                      <button type="button" disabled={i === 0} onClick={() => inFlow((steps) => { const [x] = steps.splice(i, 1); steps.splice(i - 1, 0, x) })}>Earlier</button>
                      <button type="button" disabled={i === flow.steps.length - 1} onClick={() => inFlow((steps) => { const [x] = steps.splice(i, 1); steps.splice(i + 1, 0, x) })}>Later</button>
                      <button type="button" onClick={() => inFlow((steps) => { steps.splice(i + 1, 0, { id: freshId("s", allIds(), seed), does: "New step: say what the person does", expects: "", data: "", ref: null }) })}>Add a step after</button>
                      <button type="button" disabled={flow.steps.length === 1} onClick={() => inFlow((steps, d) => { steps.splice(i, 1); for (const q of d.personas) delete q.at[flow.id] })}>Remove</button>
                      {persona && <><button type="button" onClick={() => setSpan(i, 0)}>Starts here</button><button type="button" onClick={() => setSpan(i, 1)}>Stops here</button></>}
                    </div>
                  )}
                  <div className="opx-pf-state"><span className={`opx-pf-dot ${DOT[st]}`} />{STEP_WORD[st]}</div>
                </div>
              )
            })}
          </div>
          <div className="opx-pf-box">
            <h4>What this use case asks of the build</h4>
            <ul>
              {flow.steps.map((s, i) => (states[i] === "unbuilt" ? <li key={s.id}><b>Missing: {s.does.toLowerCase()}</b><span className="opx-muted">Nothing on the page does this yet.</span></li> : states[i] === "missing" ? <li key={s.id}><b>Gone: {s.ref?.label}</b><span className="opx-muted">It was on the page and the latest scan did not find it.</span></li> : states[i] === "failed" ? <li key={s.id}><b>Being fixed: {s.ref?.label}</b><span className="opx-muted">An error. You are not asked about it.</span></li> : null))}
              {states.every((x) => x !== "unbuilt" && x !== "missing" && x !== "failed") && <li className="opx-muted">Every step has something on the page that does it, and none is failing.</li>}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  const pageView = () => {
    if (!curRoute) return <p className="opx-muted">No page of this project has been scanned yet, so there is nothing to compare users on. A scan lists what is on a page; the comparison is written over that.</p>
    const areas = doc.areas.filter((a) => a.route === curRoute), cols = doc.personas
    const pageV = curPage?.checklist.views.find((v) => v.key === "page"), pieces = curPage && pageV ? piecesOf(curPage, pageV) : []
    const marks = areas.map((a) => (curPage ? findControl(curPage.checklist, a.ref)?.control : undefined))
    return (
      <div className="opx-pf-two page">
        <div>
          {pageV && pieces.length > 0 ? (
            <div className="opx-pf-pagepic"><Shots view={pageV} pieces={pieces} />{marks.map((c, i) => (c && pageV ? <b key={areas[i].id} className="opx-pf-mark" style={{ left: `${((c.x + Math.min(c.w, 300) / 2) / pageV.w) * 100}%`, top: `${((c.y + Math.min(c.h, 120) / 2) / pageV.h) * 100}%` }}>{i + 1}</b> : null))}</div>
          ) : <div className="opx-empty">No screenshot of {curRoute} is stored.</div>}
          <small className="opx-muted" style={{ display: "block", marginTop: 6 }}>The real page, from its screenshots. The numbers match the rows beside it.</small>
        </div>
        <div className="opx-pf-flow">
          <div><h3 className="opx-pf-h">{curRoute}, part by part</h3><span className="opx-muted">Each row is a part of the page. Each column is a way of using it. Reading down a column is that user's path. Reading across a row shows who that part is for, which is what decides where it goes and how big it is.</span></div>
          {cols.length === 0 ? <p className="opx-muted">There is no way of using it written down yet. Add one under a use case ("Seen as"), and it becomes a column here.</p> : (
            <div className="opx-pf-cmp" style={{ gridTemplateColumns: `minmax(170px,1.1fr) repeat(${cols.length},minmax(140px,1fr)) minmax(180px,1.2fr)` }}>
              <div className="h">Part of the page</div>{cols.map((q) => <div className="h" key={q.id}>{q.name}<small>{doc.people.find((p) => p.id === q.who)?.name}</small></div>)}<div className="h">What that means for the design</div>
              {areas.map((a, ai) => {
                const cells = cols.map((q) => ({ persona: q.name, text: a.does[q.id] ?? "" }))
                return [
                  <div className="r" key={a.id}><span className="opx-pf-num">{ai + 1}</span><Ed value={a.name} label="Part of the page" required can={can} onSave={(v) => edit((d) => { d.areas.find((x) => x.id === a.id)!.name = v })} />
                    {can && <button type="button" className="opx-pf-x" aria-label={`Remove ${a.name}`} onClick={() => edit((d) => { d.areas = d.areas.filter((x) => x.id !== a.id) })}>Remove</button>}</div>,
                  ...cols.map((q, k) => <div key={a.id + q.id} className={`c ${cellKind(cells[k].text)}`}><Ed value={cells[k].text} hint="Not used" label={`${a.name}, for ${q.name}`} can={can} onSave={(v) => edit((d) => { const x = d.areas.find((y) => y.id === a.id)!; if (v) x.does[q.id] = v; else delete x.does[q.id] })} /></div>),
                  <div className="m opx-muted" key={a.id + "m"}>{areaMeaning(cells)}</div>,
                ]
              })}
            </div>
          )}
          {can && curPage && (
            <div className="opx-pf-ways"><small>Add a part of the page</small>
              {controlPick(null, "Add a part of the page, by the control or card that marks it", (r) => { if (r) edit((d) => { d.areas.push({ id: freshId("a", allIds(), seed), route: r.route, name: r.label.slice(0, 60), ref: r, does: {} }) }) })}</div>
          )}
        </div>
      </div>
    )
  }

  const mapView = () => {
    const sc = curPage?.score, sm = curPage?.summary, rules = (guides.data?.guides ?? []).filter((g) => g.status === "active")
    const map = buildProcessMap({
      answered: 0, questions: 0, rules: rules.length, items: curPage ? curPage.checklist.views.reduce((t, v) => t + v.controls.length, 0) : 0,
      confirmed: sc?.confirmed ?? 0, dismissed: sc?.dismissed ?? 0, waiting: sc?.unvalidated ?? 0, taste: curPage?.yours?.length ?? 0, secondLook: sc?.caughtBySecondLook ?? 0, cleared: sm?.cleared ?? 0, total: sm?.total ?? 0,
    })
    return <MapWithIntake projectId={projectId} route={curRoute} base={map} rules={rules} />
  }

  return (
    <div className="opx-pf">
      <section className="opx-sec opx-pf-top">
        <Seg value={tab} label="View" options={[["people", "People and flows"], ["map", "How the system works"]]} onChange={setTab} />
        <span className="opx-muted"><b>{doc.people.length}</b> people · <b>{doc.flows.length}</b> use cases · <b>{total("n")}</b> steps · <b>{total("ok")}</b> verified · <b>{total("gap")}</b> with nothing behind them{curPage ? <> · <b>{loose.length}</b> controls in no use case</> : null}</span>
        {routes.length > 1 && <select className="opx-pf-pick" aria-label="Page" value={curRoute ?? ""} onChange={(e) => setRoute(e.target.value)}>{routes.map((r) => <option key={r}>{r}</option>)}</select>}
        <span className="opx-muted opx-pf-save" role="status">{error ? error : saving === "saving" ? "Saving" : saving === "saved" ? "Saved" : ""}</span>
      </section>

      {tab === "map" ? mapView() : (
        <>
          <section className="opx-sec">
            <div className="opx-pf-who"><small>Who it is for</small>
              {doc.people.length > 0 && <div className="opx-seg" role="tablist" aria-label="Who it is for">{doc.people.map((p) => <button type="button" role="tab" key={p.id} aria-selected={p.id === person?.id} className={p.id === person?.id ? "on" : ""} onClick={() => { setPersonId(p.id); setFlowId(null); setPersonaId(null); setRemoving(null) }}>{p.name} <small>{doc.flows.filter((f) => f.who === p.id).length}</small></button>)}</div>}
              {can && <button type="button" className="opx-pf-add" onClick={addPerson}>Add a person</button>}
            </div>
            {!person ? <p className="opx-muted">Nobody is written down yet. Start with who signs in and what they want; use cases and the checks on each step hang from that.</p> : (
              <>
                <div className="opx-pf-head"><Ed as="h3" value={person.name} label="Person" required can={can} onSave={(v) => edit((d) => { d.people.find((x) => x.id === person.id)!.name = v })} />
                  {can && (removing === person.id
                    ? <span className="opx-pf-ways"><span className="opx-muted">Remove {person.name} with {mine.length} use case{mine.length === 1 ? "" : "s"}?</span><button type="button" className="opx-btn sm danger" onClick={() => removePerson(person.id)}>Remove</button><button type="button" className="opx-btn sm" onClick={() => setRemoving(null)}>Keep</button></span>
                    : <button type="button" className="opx-btn sm" onClick={() => setRemoving(person.id)}>Remove this person</button>)}</div>
                <div className="opx-pf-pgrid">
                  {PERSON_FIELDS.map(([k, label]) => <div key={k}><small>{label}</small><Ed as="div" value={person[k]} label={`${person.name}: ${label.toLowerCase()}`} can={can} onSave={(v) => edit((d) => { d.people.find((x) => x.id === person.id)![k] = v })} /></div>)}
                </div>
                <small className="opx-muted">Where this comes from: <Ed value={person.basis} hint="Your words, the page, or research" label="Where this description comes from" can={can} onSave={(v) => edit((d) => { d.people.find((x) => x.id === person.id)!.basis = v })} /></small>
              </>
            )}
          </section>

          {person && (
            <section className="opx-sec opx-pf-body">
              <Seg value={view} label="How to look at it" options={[["flow", "By use case"], ["page", "By page, comparing users"]]} onChange={setView} />
              {view === "page" ? pageView() : flowView()}
            </section>
          )}

          {curPage && loose.length > 0 && (
            <section className="opx-sec">
              <h3 className="opx-pf-h">On {curPage.route}, in no use case yet ({loose.length})</h3>
              <span className="opx-muted">Each of these is either part of a use case nobody has written down, or something nobody needs. Settling which is how the feature list becomes complete.</span>
              <div className="opx-pf-loose">{loose.map(({ view: v, control: c }) => <span key={c.n}><b>{c.n}</b> {c.label.slice(0, 34)}<small> {c.kind.toLowerCase()}{v.key !== "page" ? `, in ${v.name.replace("Opened by ", "").toLowerCase()}` : ""}</small></span>)}</div>
            </section>
          )}

          <section className="opx-sec">
            <h3 className="opx-pf-h">What changed</h3>
            {log.length === 0 ? <span className="opx-muted">Nothing has been changed yet. Every change made here, by you or an agent, is listed with who made it.</span> : (
              <ul className="opx-pf-log">{log.slice(0, 12).map((l) => <li key={l.version}><small>{ago(l.at)} · {l.actor === "owner" ? "you" : "an agent"}</small><span>{l.lines.slice(0, 4).join(". ")}{l.lines.length > 4 ? `, and ${l.lines.length - 4} more` : ""}.</span></li>)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** The process map with the intent count filled in from the page's plan, and the rules and who-is-asked-what beside it. */
function MapWithIntake({ projectId, route, base, rules }: { projectId: string; route: string | null; base: ReturnType<typeof buildProcessMap>; rules: { name: string; kind: string; basis: string; checks: unknown[] }[] }) {
  const plan = useJson<{ intake?: { questions: number; settled: number; reasoned: number } }>(route ? `/api/projects/${projectId}/gates/plan?route=${encodeURIComponent(route)}` : null)
  const map = useMemo(() => {
    const it = plan.data?.intake
    if (!it) return base
    return { ...base, stages: base.stages.map((g) => (g.id === "intent" ? { ...g, sub: `Why each thing is there. ${it.settled + it.reasoned} of ${it.questions} answered` } : g)) }
  }, [base, plan.data])
  return (
    <>
      <ProcessMap map={map} />
      <div className="opx-pf-three">
        <section className="opx-sec"><h3 className="opx-pf-h">Rules in force ({rules.length})</h3>
          <ul className="opx-pf-list">{rules.slice(0, 16).map((g) => <li key={g.name}><b>{g.name}</b><span className="opx-muted">{g.kind === "stack" ? "Stack" : "Statement"} · {g.checks.length} check{g.checks.length === 1 ? "" : "s"} · {g.basis.slice(0, 70)}</span></li>)}{rules.length === 0 && <li className="opx-muted">None installed on this planner yet.</li>}</ul></section>
        <section className="opx-sec"><h3 className="opx-pf-h">Who is asked what</h3>
          <ul className="opx-pf-list">
            <li><b>An error</b><span className="opx-muted">Agents. Found, confirmed, fixed, proved. Never you.</span></li>
            <li><b>A matter of taste</b><span className="opx-muted">You.</span></li>
            <li><b>What you want</b><span className="opx-muted">You: purpose, who it is for, the use case.</span></li>
            <li><b>What the product does</b><span className="opx-muted">An agent, from the code, saying what it rests on.</span></li>
            <li><b>Two agents disagree</b><span className="opx-muted">Settled with proof, not by you.</span></li>
            <li><b>A change to what you planned</b><span className="opx-muted">You, unless you already said so in your own words.</span></li>
          </ul></section>
        <section className="opx-sec"><h3 className="opx-pf-h">Where the drawing comes from</h3>
          <ul className="opx-pf-list">
            <li><b>One description of the process</b><span className="opx-muted">The lanes, steps, lines and loops are data in the planner's code, checked so no line leads nowhere. The drawing is made from it.</span></li>
            <li><b>The numbers are read, not typed</b><span className="opx-muted">From this project's checks, its plan and the rules in force{route ? `, for ${route}` : ""}.</span></li>
          </ul></section>
      </div>
    </>
  )
}
