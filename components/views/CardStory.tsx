"use client"

/*
 * The parts of an opened card that read rather than edit.
 *
 * Owner, 2026-11-16: "if i click a card, i want to see an expanded UI or modal that shows me more information,
 * especially if there are subtasks. Hover is cool but opening up for grander details with context and even images if
 * necessary makes this much better". Rules in lib/work/card-view.ts (checked).
 */

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ImagePlus, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import type { BoardStep } from "@/lib/types"
import { RichText } from "@/components/shared/RichText"
import { addPicture, cardPictures, fileUrl, kindLabel, overall, proposalParts, removePicture, stepTree, withoutPictures, type Picture } from "@/lib/work/card-view"
import { holderLine } from "./kanban/adapt"
import Link from "next/link"
import { useJson, ago, fmtDate } from "@/components/project/opx/shared"
import type { InboxItem } from "@/lib/inbox"
import type { ProjectStatus } from "./kanban-config"

const names = new Map<string, string>()

/** The project's name, fetched once per project for the card's path. */
function useProjectName(projectId: string) {
  const [name, setName] = useState(names.get(projectId) ?? "")
  useEffect(() => {
    if (names.has(projectId)) return setName(names.get(projectId)!)
    let live = true
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const n = j?.data?.name ?? j?.data?.project?.name ?? j?.project?.name ?? j?.name ?? ""
        if (n) names.set(projectId, n)
        if (live) setName(n)
      })
      .catch(() => {})
    return () => { live = false }
  }, [projectId])
  return name
}

/** Project, column and kind, who holds it, and the way to the card before and after it in the same column. */
export function CardPath({ step, statusLabel, siblings, onOpenStep }: {
  step: BoardStep; statusLabel: string; siblings: BoardStep[]; onOpenStep: (s: BoardStep) => void
}) {
  const project = useProjectName(step.project_id)
  const holder = holderLine(step, new Date())
  const i = siblings.findIndex((s) => s.id === step.id)
  const prev = i > 0 ? siblings[i - 1] : null
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null
  const nav = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground pr-10" data-testid="card-path">
      <span className="min-w-0 truncate">
        {project || "This project"} <span aria-hidden="true">›</span> {statusLabel} <span aria-hidden="true">›</span> {kindLabel(step.work_kind)}
        {holder && <span className="ml-2 text-foreground/80" title={holder.title}>· {holder.label}</span>}
      </span>
      <span className="flex-1" />
      {i >= 0 && siblings.length > 1 && <span className="hidden sm:inline whitespace-nowrap tabular-nums">{i + 1} of {siblings.length}</span>}
      <button type="button" className={nav} disabled={!prev} onClick={() => prev && onOpenStep(prev)} title={prev ? `Previous: ${prev.title}` : "First in this column"} aria-label="Previous card">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" className={nav} disabled={!next} onClick={() => next && onOpenStep(next)} title={next ? `Next: ${next.title}` : "Last in this column"} aria-label="Next card">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

/** The description, read as text; Edit turns it into a box that grows with what is typed (no scrollbar of its own). */
export function CardDescription({ text, onSave }: { text: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (!editing) setDraft(text) }, [text, editing])
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft, editing])
  const shown = withoutPictures(text)
  const finish = () => { setEditing(false); if (draft !== text) onSave(draft) }
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-[13px] font-semibold text-muted-foreground">Description</h4>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground min-h-8 px-2 rounded-md hover:bg-accent">
            <Pencil className="w-3.5 h-3.5" /> {text.trim() ? "Edit" : "Add a description"}
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea
            ref={box}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setDraft(text); setEditing(false) } }}
            className="w-full resize-none overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="What it is, why, and how it will be proved"
          />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={finish} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[13px]">Save</button>
            <button type="button" onClick={() => { setDraft(text); setEditing(false) }} className="h-8 px-3 rounded-md text-[13px] hover:bg-accent">Cancel</button>
          </div>
        </div>
      ) : shown ? (
        <div onDoubleClick={() => setEditing(true)}><RichText text={shown} maxWidth="80ch" /></div>
      ) : (
        <p className="text-sm text-muted-foreground">No description yet.</p>
      )}
    </section>
  )
}

/** A proposal's parts, in the order the owner reads them to decide. */
export function CardProposal({ metadata }: { metadata: Record<string, unknown> | null }) {
  const parts = proposalParts(metadata)
  if (!parts.length) return null
  return (
    <section data-testid="card-proposal">
      <h4 className="text-[13px] font-semibold text-muted-foreground mb-2">Proposed feature</h4>
      <dl className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        {parts.map((p) => (
          <div key={p.label} className="contents">
            <dt className="text-[13px] text-muted-foreground">{p.label}</dt>
            <dd className="text-sm leading-relaxed">{p.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The owner's open questions that hold this card: what each asks, and that it waits on him (card f473b5d4). When the
 * card's work is already live (card 2f95e84a) the heading says so and names the ship, so a blocked card is not read as
 * unfinished and a finished one is not read as owing nothing.
 */
export function CardQuestions({ step }: { step: BoardStep }) {
  const q = useJson<{ data?: InboxItem[] }>(`/api/inbox?step=${step.id}`)
  const { reload } = q
  // A move on the board (or an answer given elsewhere) changes what holds the card.
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } reload() }, [step.status, reload])
  const items = q.data?.data ?? []
  const w = step.part_waiting ?? null
  const heading = <h4 className="text-[13px] font-semibold text-muted-foreground mb-2">{w ? w.label : "Waiting on you"}</h4>
  if (q.error) {
    return (
      <section data-testid="card-questions" role="alert">
        {heading}
        <p className="text-sm text-muted-foreground">
          Could not load the questions about this card: {q.error}{" "}
          <button type="button" onClick={reload} className="h-8 px-3 rounded-md text-[13px] hover:bg-accent underline underline-offset-2">Try again</button>
        </p>
      </section>
    )
  }
  if (q.loading && !q.data) {
    // Only a blocked card says it is looking: any other card almost never has a question, and would only flicker.
    return step.status === "blocked" ? <section data-testid="card-questions">{heading}<p className="text-sm text-muted-foreground">Loading what it is waiting on…</p></section> : null
  }
  if (!items.length) return null
  return (
    <section data-testid="card-questions">
      {heading}
      {w && (
        <p className="mb-2 text-sm leading-relaxed [overflow-wrap:anywhere]" data-testid="card-shipped">
          The work is live: {w.ship.repo} at {w.ship.sha.slice(0, 8)} on {w.ship.target}, shipped {fmtDate(w.ship.at)}.
          {w.ship.left ? ` Still to do: ${w.ship.left}` : ""}
        </p>
      )}
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-lg bg-accent/40 px-3 py-2.5">
            <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">{i.question}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {i.askedBy ? `Asked by ${i.askedBy}` : "Asked"} {ago(i.askedAt)}. {step.status === "blocked" ? "This card is blocked until you answer." : "Still waiting on your answer."}{" "}
              <Link href="/inbox" className="underline underline-offset-2 hover:text-foreground">Answer in the inbox</Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Pictures on the card: shown large on a press, added by choosing or pasting an image, removed with its own button. */
export function CardPictures({ step, onSaveMetadata }: { step: BoardStep; onSaveMetadata: (m: Record<string, unknown>) => Promise<void> }) {
  const pics = cardPictures(step.metadata, step.description)
  const kept = new Set(cardPictures(step.metadata, "").map((p) => p.url))
  const [open, setOpen] = useState<Picture | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Only pictures can be added here")
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("projectId", step.project_id)
      fd.append("category", "image")
      fd.append("title", `Card picture: ${step.title}`.slice(0, 200))
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const j = await res.json().catch(() => ({}))
      // Storage is private: the planner's file route checks who asks and hands out a short-lived link.
      const docId = j.document?.id ?? j.documentId
      const url = docId ? fileUrl(docId) : null
      if (!res.ok || !url) throw new Error(j.error || `The upload failed (${res.status})`)
      await onSaveMetadata(addPicture(step.metadata, { url, caption: file.name.replace(/\.[a-z0-9]+$/i, "") }))
      toast.success("Picture added")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The picture could not be added")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // Paste a picture anywhere in the opened card to add it.
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"))
      if (f) { e.preventDefault(); upload(f) }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, step.metadata])

  return (
    <section data-testid="card-pictures">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[13px] font-semibold text-muted-foreground">Pictures {pics.length > 0 && <span className="font-normal">· {pics.length}</span>}</h4>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground min-h-8 px-2 rounded-md hover:bg-accent disabled:opacity-50">
          <ImagePlus className="w-3.5 h-3.5" /> {busy ? "Adding…" : "Add a picture"}
        </button>
        <input ref={input} type="file" accept="image/*" hidden aria-label="Choose a picture" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f) }} />
      </div>
      {pics.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">None yet. Choose one, or paste a picture while the card is open.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {pics.map((p) => (
            <figure key={p.url} className="group/pic relative m-0">
              <button type="button" onClick={() => setOpen(p)} className="block w-full overflow-hidden rounded-lg bg-accent/30" title="Show it large">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || "Card picture"} className="h-32 w-full object-cover" loading="lazy" />
              </button>
              {p.caption && <figcaption className="mt-1 text-[12px] text-muted-foreground truncate">{p.caption}</figcaption>}
              {kept.has(p.url) && (
                <button type="button" title="Remove this picture" aria-label="Remove this picture"
                  onClick={() => onSaveMetadata(removePicture(step.metadata, p.url)).then(() => toast("Picture removed"))}
                  className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover/pic:opacity-100 focus:opacity-100">
                  <X className="w-4 h-4" />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}
      {open && (
        <div role="dialog" data-card-overlay aria-label={open.caption || "Picture"} className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/85 p-6"
          onClick={() => setOpen(null)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(null) } }} tabIndex={-1} ref={(el) => el?.focus()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={open.caption || "Card picture"} className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          {open.caption && <p className="text-sm text-white/90">{open.caption}</p>}
          <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close the picture">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </section>
  )
}

/** The card's tasks and their steps, two levels, with how far along each is. */
export function CardSteps({ step, allSteps, statuses, onToggle, onOpenStep, children }: {
  step: BoardStep; allSteps: BoardStep[]; statuses: ProjectStatus[]
  onToggle: (s: BoardStep, done: boolean) => void; onOpenStep: (s: BoardStep) => void; children?: React.ReactNode
}) {
  const kindOf = (k: string) => statuses.find((s) => s.key === k)
  const isDone = (k: string) => (kindOf(k)?.kind ?? (k === "completed" ? "done" : "open")) === "done"
  const rows = stepTree(step.id, allSteps, isDone)
  const sum = overall(rows, step.progress, isDone)
  const byId = new Map(allSteps.map((s) => [s.id, s]))
  return (
    <section data-testid="card-steps">
      <div className="flex items-center gap-3 mb-2">
        <h4 className="text-[13px] font-semibold text-muted-foreground">
          {step.work_kind === "initiative" ? "Tasks" : "Steps"}{sum.total > 0 && <span className="font-normal"> · {sum.done} of {sum.total} done</span>}
        </h4>
        {sum.total > 0 && (
          <div className="flex-1 max-w-[220px] h-1.5 rounded-full bg-accent overflow-hidden" title={`${sum.percent}% done`}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${sum.percent}%` }} />
          </div>
        )}
      </div>
      <ul className="space-y-0.5">
        {rows.map(({ step: r, depth, done, total }) => {
          const s = byId.get(r.id)
          if (!s) return null
          const st = kindOf(s.status)
          const finished = isDone(s.status)
          return (
            <li key={s.id} className="flex items-center gap-2 rounded-md px-2 min-h-9 hover:bg-accent/40" style={{ paddingLeft: 8 + depth * 24 }}>
              <input type="checkbox" checked={finished} onChange={(e) => onToggle(s, e.target.checked)} className="h-4 w-4 accent-emerald-500" aria-label={`Done: ${s.title}`} />
              <button type="button" onClick={() => onOpenStep(s)} className={`flex-1 min-w-0 text-left text-sm truncate hover:underline ${finished ? "line-through text-muted-foreground" : ""}`} title="Open it">
                {s.title}
              </button>
              {total > 0 && <span className="text-[12px] text-muted-foreground tabular-nums">{done}/{total}</span>}
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st?.color ?? "#87909e" }} />
                {st?.label ?? s.status}
              </span>
            </li>
          )
        })}
      </ul>
      {children}
    </section>
  )
}
