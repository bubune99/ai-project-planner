"use client"

/*
 * Checks tab: the per-page checklist an agent must clear before a screen is
 * done. Left: every control, grouped by view (the page, and each menu, dialog
 * or panel that opens from it). Right: the chosen control ringed on its view's
 * picture, and its workflows side by side, each ticked once per state.
 * Display only: counts, order and verdict rules come from lib/gates/gate-model.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, Minus, X } from "lucide-react"
import { checkKey, checkState, controlProgress, type CheckState, type Checklist, type Control, type Result, type Summary, type View } from "@/lib/gates/gate-model"
import { GuidesSection } from "./GuidesSection"
import { ago, useJson } from "./shared"

interface PageRow { id: string; route: string; title: string | null; version: number; env: string | null; createdAt: string; controls: number; views: number; summary: Summary }
interface Change { view: string; label: string; kind: string }
interface PageData {
  id: string; route: string; version: number; env: string | null; build: string | null; createdAt: string
  checklist: Checklist; results: Result[]; images: { kind: "view" | "evidence"; key: string; url: string }[]; extracts?: string[]
  changes: { added: Change[]; removed: Change[]; kept: number }; summary: Summary; hook: string; canSettle: boolean
}

interface PlanItem { id: string; label: string; kind?: string; view?: string; must: string; source: string }
interface PlanChangeRow { id: string; action: "add" | "remove" | "seed"; item: PlanItem; reason: string; quote: string | null; needs_owner: boolean; why: string; status: "applied" | "waiting" | "approved" | "rejected"; created_at: string; decided_via?: string | null; said?: string | null }
interface PlanData {
  hasPlan: boolean; items: PlanItem[]; changes: PlanChangeRow[]; canSettle: boolean
  compare: { matched: { expected: PlanItem; n: number }[]; missing: PlanItem[]; waiting: PlanItem[]; unplanned: { n: number; view: string; label: string; kind: string }[] } | null
}
const SOURCE_WORD: Record<string, string> = { owner: "you asked for it", mockup: "from the approved mock-up", flow: "from the flow", agent: "added by an agent" }

/** What the page is supposed to have, set against what the scan found, and the record of every change to that plan. */
function PlanSection({ projectId, route, tick, onPick }: { projectId: string; route: string; tick: number; onPick: (n: number) => void }) {
  const plan = useJson<PlanData>(`/api/projects/${projectId}/gates/plan?route=${encodeURIComponent(route)}`)
  const [error, setError] = useState<string | null>(null)
  const reload = plan.reload
  useEffect(() => { if (tick) reload() }, [tick, reload])
  const d = plan.data
  if (!d) return null
  async function decide(changeId: string, approve: boolean) {
    setError(null)
    const res = await fetch(`/api/projects/${projectId}/gates/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decide", route, changeId, approve }) })
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Could not save that")
    reload()
  }
  if (!d.hasPlan) {
    return (
      <section className="opx-sec opx-ck-plan">
        <h3 className="opx-ck-h3">Against the plan</h3>
        <p className="opx-muted">No plan is recorded for this page, so it is only checked against what is on it. Before building, an agent records what the page should have, from your request or the approved mock-up; then anything missing or unplanned shows here.</p>
      </section>
    )
  }
  const c = d.compare, waiting = d.changes.filter((x) => x.status === "waiting")
  return (
    <section className="opx-sec opx-ck-plan">
      <h3 className="opx-ck-h3">Against the plan</h3>
      {c && (
        <p className="opx-muted">
          {c.matched.length} of {d.items.length} planned controls are on the page.
          {c.missing.length === 0 && c.unplanned.length === 0 && " Nothing is missing and nothing is unplanned."}
        </p>
      )}
      {c && (c.missing.length > 0 || c.unplanned.length > 0) && (
        <div className="opx-ck-plancols">
          {c.missing.length > 0 && (
            <div>
              <h4 className="opx-ck-h4">Planned, not on the page ({c.missing.length})</h4>
              <ul>{c.missing.map((e) => <li key={e.id}><b>{e.label}</b><span className="opx-muted">{e.must ? `${e.must}. ` : ""}{SOURCE_WORD[e.source] ?? e.source}</span></li>)}</ul>
            </div>
          )}
          {c.unplanned.length > 0 && (
            <div>
              <h4 className="opx-ck-h4">On the page, not in the plan ({c.unplanned.length})</h4>
              <ul>{c.unplanned.map((u) => <li key={u.n}><button type="button" onClick={() => onPick(u.n)}><b>{u.label}</b></button><span className="opx-muted">{u.kind}, control {u.n}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
      {waiting.length > 0 && (
        <div>
          <h4 className="opx-ck-h4">Waiting on you ({waiting.length})</h4>
          <ul>
            {waiting.map((w) => (
              <li key={w.id} className="opx-ck-ask">
                <b>{w.action === "add" ? "Add" : "Drop"} "{w.item.label}"?</b>
                <span className="opx-muted">Reason given: {w.reason}</span>
                <span className="opx-muted">Why you are asked: {w.why}</span>
                {d.canSettle && <span className="opx-ck-settle"><button type="button" onClick={() => decide(w.id, true)}>Approve the change</button><button type="button" onClick={() => decide(w.id, false)}>Keep it as planned</button></span>}
              </li>
            ))}
          </ul>
          {error && <p className="opx-ck-note">{error}</p>}
        </div>
      )}
      {d.changes.some((x) => x.status !== "waiting") && (
        <details>
          <summary>Changes to the plan ({d.changes.filter((x) => x.status !== "waiting").length})</summary>
          <ul>
            {d.changes.filter((x) => x.status !== "waiting").map((x) => (
              <li key={x.id}>
                <b>{x.action === "seed" ? `Recorded ${x.item.label}` : `${x.action === "add" ? "Added" : "Dropped"} "${x.item.label}"`}{x.status === "rejected" ? " (you said no" : x.status === "approved" ? " (you approved" : ""}{x.status === "rejected" || x.status === "approved" ? `${x.decided_via === "claude-code" ? `, in Claude Code: "${x.said ?? ""}"` : ""})` : ""}</b>
                <span className="opx-muted">{x.reason} {x.needs_owner ? "You were asked: " : "You were not asked: "}{x.why} {ago(x.created_at)}.</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

const STATE_WORD: Record<CheckState, string> = { pending: "Not checked", passed: "Passed", failed: "Failed", waived: "Waived", disputed: "Disputed" }

/** A short list of control names: the first few, then how many more. */
const names = (list: Change[]) => list.slice(0, 5).map((c) => c.label).join(", ") + (list.length > 5 ? `, and ${list.length - 5} more` : "")

function Mark({ state, small }: { state: CheckState; small?: boolean }) {
  const size = small ? 11 : 13
  return (
    <span className={`opx-ck-mark ${state}${small ? " sm" : ""}`} aria-label={STATE_WORD[state]}>
      {state === "passed" && <Check size={size} strokeWidth={3} />}
      {state === "failed" && <X size={size} strokeWidth={3} />}
      {state === "waived" && <Minus size={size} strokeWidth={3} />}
      {state === "disputed" && <AlertTriangle size={size - 1} strokeWidth={2.5} />}
    </span>
  )
}

const SHOWN = {
  extract: "The page itself, redrawn from the HTML and styles the scan stored.",
  picture: "Picture taken during the scan.",
  wire: "Wireframe, drawn from where the scan found each control.",
}

/**
 * A view redrawn from its stored extract (the page's HTML with its styles
 * written inline). It is drawn in a sealed frame: nothing in it can run, and it
 * cannot reach the planner. The frame is the size the page was scanned at,
 * scaled to fit and shifted so only this view's part shows.
 */
function Extract({ url, view }: { url: string; view: View }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const { data, error } = useJson<{ html: string }>(url)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const crop = view.crop ?? { x: 0, y: 0, vw: view.w, vh: view.h }
  const scale = width ? width / view.w : 0
  return (
    <div ref={box} className="opx-ck-extract" style={{ aspectRatio: `${view.w} / ${view.h}` }}>
      {data?.html && scale > 0 && (
        <iframe
          title={`${view.name}, redrawn`} sandbox="" tabIndex={-1} aria-hidden="true"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}</style></head><body>${data.html}</body></html>`}
          style={{ width: crop.vw, height: crop.vh, transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px) scale(${scale})` }}
        />
      )}
      {error && <p className="opx-muted">The stored page could not be loaded: {error}</p>}
    </div>
  )
}

/** A control's own picture, cut from its view's picture rather than stored. */
function Crop({ view, c, src }: { view: View; c: Control; src?: string }) {
  const pad = 6, z = Math.min(2, 28 / (c.h + pad * 2))
  if (!src) return <span className="opx-ck-crop" />
  return (
    <span className="opx-ck-crop" style={{
      width: Math.min(96, (c.w + pad * 2) * z),
      backgroundImage: `url("${src}")`, backgroundSize: `${view.w * z}px ${view.h * z}px`,
      backgroundPosition: `${-(c.x - pad) * z}px ${-(c.y - pad) * z}px`,
    }} />
  )
}

export function ChecksTab({ projectId }: { projectId: string }) {
  const pages = useJson<{ pages: PageRow[] }>(`/api/projects/${projectId}/gates`)
  const [pageId, setPageId] = useState<string | null>(null)
  const list = pages.data?.pages ?? []
  const current = list.find((p) => p.id === pageId) ?? list[0] ?? null
  const page = useJson<PageData>(current ? `/api/projects/${projectId}/gates/${current.id}` : null)
  const [pick, setPick] = useState<number | null>(null)
  const [settle, setSettle] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"extract" | "picture" | "wire" | null>(null)
  const [planTick, setPlanTick] = useState(0)

  // Checks clear while an agent works: refresh while the tab is in view.
  const reloadPage = page.reload, reloadPages = pages.reload
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") { reloadPage(); reloadPages(); setPlanTick((t) => t + 1) } }, 6000)
    return () => clearInterval(t)
  }, [reloadPage, reloadPages])

  const data = page.data && current && page.data.id === current.id ? page.data : null
  const controls = useMemo(() => (data ? data.checklist.views.flatMap((v) => v.controls.map((c) => ({ c, v }))) : []), [data])
  const chosen = controls.find((x) => x.c.n === pick) ?? controls[0] ?? null
  const imageOf = (viewKey: string) => data?.images.find((i) => i.kind === "view" && i.key === viewKey)?.url
  const hasPicture = !!(chosen && imageOf(chosen.v.key)), hasExtract = !!(chosen && chosen.v.crop && data?.extracts?.includes(chosen.v.key))
  // What is drawn behind the numbers: the stored page if there is one, else the picture, else a wireframe. The owner can switch.
  const shown = mode === "extract" && hasExtract ? "extract" : mode === "picture" && hasPicture ? "picture" : mode === "wire" ? "wire" : hasExtract ? "extract" : hasPicture ? "picture" : "wire"

  async function verdict(key: string, status: "passed" | "failed" | "waived") {
    if (!data) return
    setError(null)
    const res = await fetch(`/api/projects/${projectId}/gates/${data.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verdict", keys: [key], status, note: note.trim() || undefined }),
    })
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? "Could not save that"); return }
    setSettle(null); setNote(""); page.reload(); pages.reload()
  }

  if (pages.loading && !pages.data) return <section className="opx-sec"><p className="opx-muted">Loading checks...</p></section>
  if (pages.error) return <section className="opx-sec"><p className="opx-muted">Checks could not be loaded: {pages.error}</p></section>
  if (!current) {
    return (
      <div className="opx-ck">
      <section className="opx-sec">
        <h2>Checks</h2>
        <p className="opx-muted" style={{ maxWidth: 640 }}>
          No page has a checklist yet. An agent creates one by scanning a page of this project: it lists every control on the page and in the menus and dialogs that open from it, and what each one must do. The list then appears here, and you can watch the checks clear.
        </p>
      </section>
      <GuidesSection />
      </div>
    )
  }

  const s = data?.summary ?? current.summary
  return (
    <div className="opx-ck">
      <section className="opx-sec opx-ck-head">
        <div className="opx-ck-title">
          <div>
            <h2>Checks</h2>
            <p className="opx-muted">One list per page. Each control has its workflows, each workflow is checked in every state, and every step checks the action and the picture.</p>
          </div>
          <label className="opx-ck-page">
            <span className="opx-muted">Page</span>
            <select value={current.id} onChange={(e) => { setPageId(e.target.value); setPick(null); setSettle(null) }}>
              {list.map((p) => <option key={p.id} value={p.id}>{p.route} ({p.summary.cleared} of {p.summary.total})</option>)}
            </select>
          </label>
          <div className="opx-ck-count">
            <strong>{s.cleared} of {s.total}</strong> cleared
            <div className="opx-ck-bar"><i style={{ width: `${s.total ? (s.cleared / s.total) * 100 : 0}%` }} /></div>
          </div>
        </div>
        {data && <p className="opx-ck-hook"><strong>What the agent is told:</strong> {data.hook}</p>}
        {data && (
          <p className="opx-muted opx-ck-meta">
            Version {data.version}{data.env ? `, scanned on ${data.env}` : ""}, {ago(data.createdAt)}.
            {s.failed > 0 && ` ${s.failed} failed.`}{s.disputed > 0 && ` ${s.disputed} disputed and waiting for you.`}
            {s.cleared > 0 && ` ${s.reviewed} of the ${s.cleared} cleared were also looked at by a second reviewer.`}
            {data.changes.removed.length > 0 && ` Gone since the last version: ${names(data.changes.removed)}.`}
            {data.changes.added.length > 0 && ` New since the last version: ${names(data.changes.added)}.`}
          </p>
        )}
      </section>

      <PlanSection projectId={projectId} route={current.route} tick={planTick} onPick={(n) => { setPick(n); setSettle(null) }} />

      {!data && <section className="opx-sec"><p className="opx-muted">{page.error ? `This checklist could not be loaded: ${page.error}` : "Loading this page's checklist..."}</p></section>}

      {data && chosen && (
        <div className="opx-ck-split">
          <section className="opx-sec opx-ck-list" aria-label="Controls">
            <h3 className="opx-ck-h3">Controls on {data.route}</h3>
            {data.checklist.views.map((v, vi) => (
              <div key={v.key}>
                {vi > 0 && <h4 className="opx-ck-h4">{v.name}</h4>}
                {v.controls.map((c) => {
                  const p = controlProgress(c, data.results)
                  return (
                    <button key={c.n} type="button" className={`opx-ck-row${chosen.c.n === c.n ? " on" : ""}`} aria-current={chosen.c.n === c.n ? "true" : undefined} onClick={() => { setPick(c.n); setSettle(null) }}>
                      <span className={`opx-ck-num ${p.worst}`}>{c.n}</span>
                      <Crop view={v} c={c} src={imageOf(v.key)} />
                      <span className="opx-ck-name"><b>{c.label}</b><small>{p.cleared} of {p.total} checks{c.shared ? ", every page" : ""}</small></span>
                      <Mark state={p.cleared === p.total ? "passed" : p.worst === "passed" ? "pending" : p.worst} />
                    </button>
                  )
                })}
              </div>
            ))}
          </section>

          <section className={`opx-sec opx-ck-detail${chosen.v.w < 700 ? " narrow" : ""}`}>
            <header className="opx-ck-dhead">
              <span className="opx-ck-num">{chosen.c.n}</span>
              <h3>{chosen.c.label}</h3>
              <span className="opx-muted">
                {chosen.c.kind}, {chosen.c.workflows.length} workflow{chosen.c.workflows.length === 1 ? "" : "s"} in {chosen.c.states.length} state{chosen.c.states.length === 1 ? "" : "s"}. It passes when all of them pass.
                {chosen.c.shared && " It is on every page, so passing here passes it everywhere."}
              </span>
            </header>

            {data.checklist.views.length > 1 && (
              <div className="opx-ck-views">
                <span className="opx-muted">Views of this page</span>
                {data.checklist.views.map((v) => (
                  <button key={v.key} type="button" className={v.key === chosen.v.key ? "on" : ""} disabled={!v.controls.length} onClick={() => { setPick(v.controls[0]?.n ?? null); setSettle(null) }}>
                    {imageOf(v.key) ? <img src={imageOf(v.key)} alt="" /> : <span className="opx-ck-noimg" />}
                    <span>{v.name}, {v.controls.length}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="opx-ck-shotbar">
              <span className="opx-muted">{SHOWN[shown]}</span>
              {(["extract", "picture", "wire"] as const).filter((m) => m !== shown && (m === "wire" || (m === "picture" ? hasPicture : hasExtract))).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)}>{m === "extract" ? "Show the page" : m === "picture" ? "Show the picture" : "Show the wireframe"}</button>
              ))}
            </div>
            <div className="opx-ck-shot" style={chosen.v.w < 700 ? { width: Math.min(620, chosen.v.w * 1.15) } : undefined}>
              <div className="opx-ck-canvas">
              {shown === "extract" ? <Extract url={`/api/projects/${projectId}/gates/${data.id}/extract?view=${encodeURIComponent(chosen.v.key)}`} view={chosen.v} />
                : shown === "picture" ? <img src={imageOf(chosen.v.key)} alt={`${chosen.v.name} of ${data.route}`} />
                : (
                  // No picture needed: the scan recorded where every control sits, so the view can be drawn.
                  <div className="opx-ck-wire" style={{ aspectRatio: `${chosen.v.w} / ${chosen.v.h}` }} role="img" aria-label={`Wireframe of ${chosen.v.name}`}>
                    {chosen.v.controls.map((c) => (
                      <span key={c.n} style={{ left: `${(c.x / chosen.v.w) * 100}%`, top: `${(c.y / chosen.v.h) * 100}%`, width: `${(c.w / chosen.v.w) * 100}%`, height: `${(c.h / chosen.v.h) * 100}%` }}>{c.label}</span>
                    ))}
                  </div>
                )}
              {chosen.v.controls.map((c) => (
                <button key={c.n} type="button" className={`opx-ck-pin ${controlProgress(c, data.results).worst}${c.n === chosen.c.n ? " on" : ""}`} style={{ left: `${(c.x / chosen.v.w) * 100}%`, top: `${(c.y / chosen.v.h) * 100}%` }} aria-label={`Control ${c.n}: ${c.label}`} onClick={() => { setPick(c.n); setSettle(null) }}>{c.n}</button>
              ))}
              <span className="opx-ck-ring" style={{ left: `${(chosen.c.x / chosen.v.w) * 100}%`, top: `${(chosen.c.y / chosen.v.h) * 100}%`, width: `${(chosen.c.w / chosen.v.w) * 100}%`, height: `${(chosen.c.h / chosen.v.h) * 100}%` }} />
              </div>
            </div>

            <div className="opx-ck-flows">
              {chosen.c.workflows.map((w) => (
                <article key={w.name} className="opx-ck-flow">
                  <header><b>{w.name}</b>{w.before && <span className="opx-muted">Start from: {w.before}</span>}</header>
                  <ol>
                    {w.steps.map((st, i) => (
                      <li key={i}>
                        <span className="opx-ck-step">{i + 1}</span>
                        <div>
                          <b>{st.do}</b>
                          <span className="opx-muted">{st.expect}</span>
                          {!!st.there?.length && <span><small>Must be there</small>{st.there.join(", ")}</span>}
                          {!!st.gone?.length && <span><small>Must be gone</small>{st.gone.join(", ")}</span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <footer>
                    {chosen.c.states.map((state) => {
                      const key = checkKey(chosen.c.n, w.name, state), now = checkState(data.results, key)
                      const last = [...data.results].reverse().find((r) => r.key === key && r.note)
                      const evidence = data.images.find((i) => i.kind === "evidence" && i.key === key)
                      return (
                        <div key={state} className="opx-ck-state">
                          <button type="button" disabled={!data.canSettle} aria-expanded={settle === key} onClick={() => { setSettle(settle === key ? null : key); setNote(""); setError(null) }}>
                            <Mark state={now} small /><span>{state}</span><small>{STATE_WORD[now]}</small>
                          </button>
                          {(now === "failed" || now === "disputed") && last?.note && <p className="opx-ck-note">{last.actor === "owner" ? "You" : `The ${last.actor}`}: {last.note}</p>}
                          {evidence && <a className="opx-ck-ev" href={evidence.url} target="_blank" rel="noreferrer">See the picture</a>}
                          {settle === key && (
                            <div className="opx-ck-settle">
                              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed to fail it)" aria-label="Note" />
                              <button type="button" onClick={() => verdict(key, "passed")}>It passes</button>
                              <button type="button" disabled={!note.trim()} onClick={() => verdict(key, "failed")}>It fails</button>
                              <button type="button" onClick={() => verdict(key, "waived")}>Waive it</button>
                              {error && <p className="opx-ck-note">{error}</p>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      <GuidesSection />
    </div>
  )
}
