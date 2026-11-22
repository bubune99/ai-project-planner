"use client"

/*
 * Changing a project's phases, on its Overview (card 2dd7fa3a).
 *
 * The strip above this draws the phases from the project's cards (lib/project/phase-strip.ts): a card's `phase` is
 * the phase's number, and its heading card ("Phase 3 — Dashboard Completion") gives the name. Nothing on a screen
 * could add, rename, move or remove one. This is that editor. Every rule is in lib/project/phase-edit.ts; this file
 * only draws the list and sends the card writes it is given, one at a time, through the routes that already own
 * card writes. Each change saves as it is made and can be taken back with Undo.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { toast } from "sonner"
import {
  addPhase, invertWrites, movePhase, outsidePhaseFor, phaseLabel, planWrites, readPhases, removePhase,
  renamePhase, NAME_MAX, type Edited, type EditPhase, type PhaseCard, type PhaseWrite,
} from "@/lib/project/phase-edit"

type Made = Record<string, string>
type Undoable = { label: string; writes: PhaseWrite[] }
/** A save that stopped part-way: what is still to send, and what already went. */
type Stopped = { label: string; error: string; rest: PhaseWrite[]; sent: PhaseWrite[]; cards: PhaseCard[]; made: Made; undoable: boolean }

const BTN = { minHeight: 44 } as const
const HEADING_NOTE = "The heading card of a phase. The Overview takes the phase's name from this card's title, and counts every card with the same phase number as part of the phase."

async function sendWrite(projectId: string, w: PhaseWrite): Promise<string | null> {
  const base = `/api/projects/${projectId}/steps`
  const json = { "Content-Type": "application/json" }
  const res =
    w.kind === "create"
      // Requests, not Up next: a heading card is not work to hand to an agent.
      ? await fetch(base, { method: "POST", headers: json, body: JSON.stringify({ title: w.title, phase: w.phase, status: "requested", description: HEADING_NOTE }) })
      : w.kind === "delete"
        ? await fetch(`${base}/${w.id}`, { method: "DELETE" })
        : await fetch(`${base}/${w.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ ...(w.phase !== undefined ? { phase: w.phase } : {}), ...(w.title !== undefined ? { title: w.title } : {}) }) })
  const j = await res.json().catch(() => null)
  if (!res.ok) throw new Error((typeof j?.error === "string" ? j.error : j?.error?.message) || `The server answered ${res.status}`)
  return w.kind === "create" ? (typeof j?.step?.id === "string" ? j.step.id : null) : null
}

export function PhaseEditor({ projectId, steps, currentPhase, onChanged }: {
  projectId: string
  /** The project's cards, as the page already loaded them. */
  steps: { id: string; title?: string | null; phase?: string | null }[]
  /** projects.current_phase: where a card goes when its phase is removed. */
  currentPhase?: string | null
  /** Reload the project's cards. */
  onChanged: () => void
}) {
  const cards = useMemo<PhaseCard[]>(() => (steps || []).filter((s) => s && typeof s.id === "string").map((s) => ({ id: s.id, title: s.title ?? "", phase: s.phase ?? "" })), [steps])
  const phases = useMemo(() => readPhases(cards), [cards])
  const outside = outsidePhaseFor(currentPhase)

  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [stopped, setStopped] = useState<Stopped | null>(null)
  const [undo, setUndo] = useState<Undoable[]>([])
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newAt, setNewAt] = useState("end")
  const [problem, setProblem] = useState<{ where: string; text: string } | null>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  const locked = !!progress || !!stopped

  // The place picked for a new phase may be gone after a change.
  useEffect(() => { if (newAt !== "end" && !phases.some((p) => p.key === newAt)) setNewAt("end") }, [phases, newAt])

  /** Sends the writes in order. Stops at the first that fails and keeps the rest, so nothing is sent twice. */
  const send = async (label: string, writes: PhaseWrite[], before: PhaseCard[], undoable: boolean, already: { sent: PhaseWrite[]; made: Made } = { sent: [], made: {} }) => {
    const sent = [...already.sent]
    const made = { ...already.made }
    const total = sent.length + writes.length
    setStopped(null)
    setProgress({ label, done: sent.length, total })
    for (let i = 0; i < writes.length; i++) {
      try {
        const id = await sendWrite(projectId, writes[i])
        const w = writes[i]
        if (w.kind === "create" && id) made[w.key] = id
        sent.push(w)
        setProgress({ label, done: sent.length, total })
      } catch (e) {
        setProgress(null)
        setStopped({ label, error: e instanceof Error ? e.message : "The change was not saved", rest: writes.slice(i), sent, cards: before, made, undoable })
        return
      }
    }
    setProgress(null)
    if (undoable) setUndo((u) => [...u, { label, writes: invertWrites(sent, before, made) }])
    onChanged()
    toast.success(label)
  }

  const change = (where: string, label: string, edited: Edited, then?: () => void) => {
    if (!edited.ok) { setProblem({ where, text: edited.error }); return }
    setProblem(null)
    then?.()
    const writes = planWrites(cards, phases, edited.phases, outside)
    if (writes.length) void send(label, writes, cards, true)
  }

  const add = () => {
    const at = newAt === "end" ? phases.length : phases.findIndex((p) => p.key === newAt)
    change("add", `Added the phase "${newName.replace(/\s+/g, " ").trim()}"`, addPhase(phases, newName, at < 0 ? phases.length : at), () => { setNewName(""); setNewAt("end") })
  }
  const rename = () => {
    if (!renaming) return
    const p = phases.find((x) => x.key === renaming.key)
    change(`row:${renaming.key}`, `Renamed ${p ? `"${phaseLabel(p)}"` : "the phase"} to "${renaming.name.replace(/\s+/g, " ").trim()}"`, renamePhase(phases, renaming.key, renaming.name), () => setRenaming(null))
  }
  const move = (p: EditPhase, to: number) => change(`row:${p.key}`, `Moved "${phaseLabel(p)}" to place ${to + 1}`, movePhase(phases, p.key, to))
  const remove = (p: EditPhase) => change(`row:${p.key}`, `Removed the phase "${phaseLabel(p)}"`, removePhase(phases, p.key), () => setRemoving(null))

  const undoLast = () => {
    const last = undo[undo.length - 1]
    if (!last || locked) return
    setUndo((u) => u.slice(0, -1))
    void send(`Undid: ${last.label}`, last.writes, cards, false)
  }
  const carryOn = () => { if (stopped) void send(stopped.label, stopped.rest, stopped.cards, stopped.undoable, { sent: stopped.sent, made: stopped.made }) }
  const putBack = () => { if (stopped) void send(`Put back: ${stopped.label}`, invertWrites(stopped.sent, stopped.cards, stopped.made), stopped.cards, false) }

  const close = () => { setOpen(false); setRenaming(null); setRemoving(null); setProblem(null); openButton.current?.focus() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return
    e.stopPropagation()
    if (renaming) setRenaming(null)
    else if (removing) setRemoving(null)
    else if (!locked) close()
  }

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button ref={openButton} className="opx-btn" style={BTN} data-testid="phase-editor-open" onClick={() => setOpen(true)}>
          {phases.length ? "Edit phases" : "Add phases"}
        </button>
      </div>
    )
  }

  const says = (where: string) => problem?.where === where && (
    <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--opx-hot)" }}>{problem.text}</p>
  )

  return (
    <div data-testid="phase-editor" onKeyDown={onKey} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>
          Edit phases <span className="opx-muted" style={{ fontWeight: 400, fontSize: 13 }}>{phases.length} {phases.length === 1 ? "phase" : "phases"}</span>
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {undo.length > 0 && (
            <button className="opx-btn" style={BTN} disabled={locked} onClick={undoLast} data-testid="phase-undo">Undo: {undo[undo.length - 1].label}</button>
          )}
          <button className="opx-btn" style={BTN} disabled={locked} onClick={close}>Done</button>
        </div>
      </div>
      <p className="opx-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        A phase is its heading card and every card with the same phase number. Each change is saved as you make it. Adding a phase makes its heading card in Requests.
      </p>

      {progress && (
        <p role="status" className="opx-muted" style={{ margin: 0, fontSize: 13 }}>
          Saving: {progress.done} of {progress.total} {progress.total === 1 ? "card" : "cards"} written…
        </p>
      )}
      {stopped && (
        <div role="alert" className="opx-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13.5 }}>
            <b>This change stopped part-way.</b> {stopped.sent.length} of {stopped.sent.length + stopped.rest.length} cards were written before the server said: {stopped.error}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="opx-btn primary" style={BTN} onClick={carryOn}>Try the rest again</button>
            {stopped.sent.length > 0 && <button className="opx-btn" style={BTN} onClick={putBack}>Put back what was written</button>}
            {stopped.sent.length === 0 && <button className="opx-btn" style={BTN} onClick={() => setStopped(null)}>Leave it</button>}
          </div>
        </div>
      )}

      {phases.length === 0 && <p className="opx-muted" style={{ margin: 0, fontSize: 13 }}>No phases yet. Add the first one below.</p>}

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {phases.map((p, i) => {
          const label = phaseLabel(p)
          const tasks = p.cardIds.length - (p.headingId ? 1 : 0)
          const isRenaming = renaming?.key === p.key
          return (
            <li key={p.key} className="opx-card" data-phase-row={p.number} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {isRenaming ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input className="opx-input" style={{ flex: "1 1 220px", width: "auto" }} autoFocus maxLength={NAME_MAX} aria-label={`New name for phase ${p.number}`}
                    value={renaming.name} onChange={(e) => setRenaming({ key: p.key, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") rename() }} />
                  <button className="opx-btn primary" style={BTN} disabled={locked} onClick={rename}>Save name</button>
                  <button className="opx-btn" style={BTN} onClick={() => { setRenaming(null); setProblem(null) }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <b style={{ fontSize: 14, overflowWrap: "anywhere" }}>{label}</b>
                    <div className="opx-muted" style={{ fontSize: 12.5 }}>
                      Phase {p.number} · {tasks} {tasks === 1 ? "task" : "tasks"}{p.headingId ? "" : " · no heading card yet"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="opx-btn" style={BTN} disabled={locked || i === 0} onClick={() => move(p, i - 1)} aria-label={`Move ${label} earlier`} title="Move earlier"><ArrowUp className="h-4 w-4" aria-hidden /> Earlier</button>
                    <button className="opx-btn" style={BTN} disabled={locked || i === phases.length - 1} onClick={() => move(p, i + 1)} aria-label={`Move ${label} later`} title="Move later"><ArrowDown className="h-4 w-4" aria-hidden /> Later</button>
                    <button className="opx-btn" style={BTN} disabled={locked} onClick={() => { setRemoving(null); setProblem(null); setRenaming({ key: p.key, name: p.name }) }} aria-label={`Rename ${label}`}>Rename</button>
                    <button className="opx-btn danger" style={BTN} disabled={locked} onClick={() => { setRenaming(null); setProblem(null); setRemoving(p.key) }} aria-label={`Remove ${label}`}>Remove</button>
                  </div>
                </div>
              )}
              {removing === p.key && !isRenaming && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                    Remove "{label}"? No card is deleted. {p.cardIds.length === 1 ? "Its 1 card stays" : `Its ${p.cardIds.length} cards stay`} on the board, outside any phase{p.headingId && p.name ? `, and the heading card is renamed "${p.name}"` : ""}.{i < phases.length - 1 ? " Later phases move up one." : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="opx-btn danger" style={BTN} disabled={locked} onClick={() => remove(p)} data-testid="phase-remove-confirm">Remove phase</button>
                    <button className="opx-btn" style={BTN} onClick={() => setRemoving(null)}>Keep it</button>
                  </div>
                </div>
              )}
              {says(`row:${p.key}`)}
            </li>
          )
        })}
      </ol>

      <div className="opx-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="opx-input" style={{ flex: "2 1 220px", width: "auto" }} maxLength={NAME_MAX} aria-label="Name of the new phase" placeholder="Name of the new phase"
            value={newName} onChange={(e) => { setNewName(e.target.value); if (problem?.where === "add") setProblem(null) }}
            onKeyDown={(e) => { if (e.key === "Enter" && !locked) add() }} />
          {phases.length > 0 && (
            <select className="opx-input" style={{ flex: "1 1 180px", width: "auto" }} aria-label="Where the new phase goes" value={newAt} onChange={(e) => setNewAt(e.target.value)}>
              <option value="end">At the end</option>
              {phases.map((p) => <option key={p.key} value={p.key}>Before {phaseLabel(p)}</option>)}
            </select>
          )}
          <button className="opx-btn primary" style={BTN} disabled={locked} onClick={add} data-testid="phase-add">Add phase</button>
        </div>
        {says("add")}
      </div>
    </div>
  )
}
