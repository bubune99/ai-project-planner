"use client"

/*
 * Quick actions on a board card (owner 2026-11-13): done, start, flag and
 * due date without opening the card. All four PATCH the step through the
 * board's own optimistic patchStep, so a failure reverts like a drag does.
 */

import { useRef } from "react"
import { Check, Play, Flag, CalendarDays } from "lucide-react"
import { askText } from "@/lib/ui/ask"
import type { BoardStep } from "@/lib/types"

const btn =
  "grid h-7 w-7 place-items-center rounded-full text-[var(--opx-muted,#5a687c)] transition-colors hover:bg-[var(--opx-card,#fff)] hover:text-[var(--opx-ink,#20355b)]"

export function CardActions({
  step,
  isDone,
  isActive,
  activeKey,
  onToggleComplete,
  onPatch,
  onStart,
}: {
  step: BoardStep
  isDone: boolean
  isActive: boolean
  /** Status key for "in progress"; null when the project has no such column. */
  activeKey: string | null
  onToggleComplete: (step: BoardStep) => void
  onPatch: (stepId: string, patch: Record<string, unknown>) => void
  /** Puts the card in line for its project's agents (KanbanView.startStep). */
  onStart?: (stepId: string) => Promise<string>
}) {
  const dateRef = useRef<HTMLInputElement>(null)
  const flagged = !!(step.metadata && (step.metadata as Record<string, unknown>).flagged)
  // A request is approved (moved to Up next, which sends it to an agent) or set aside with the owner's reason, which
  // agents read before proposing the same kind of thing again (lib/work/proposal.ts).
  if (step.status === "requested") {
    const word = "rounded-full px-3 min-h-7 text-[13px] font-semibold transition-colors"
    return (
      <>
        <button type="button" className={`${word} bg-[var(--opx-card,#fff)] hover:bg-[var(--opx-ink,#20355b)] hover:text-white`} aria-label={`Approve: ${step.title}`}
          onClick={(e) => { e.stopPropagation(); onPatch(step.id, { status: "pending" }) }}>Approve</button>
        <button type="button" className={`${word} text-[var(--opx-muted,#5a687c)] hover:bg-[var(--opx-card,#fff)]`} aria-label={`Not now: ${step.title}`}
          onClick={(e) => {
            e.stopPropagation()
            void askText({ title: `Not now: "${step.title}"`, body: "The request is set aside. Agents read your reason before proposing something like it again.", confirm: "Set aside", field: { label: "Why", required: false } }).then((why) => {
              if (why === null) return
              onPatch(step.id, { status: "paused", metadata: { ...(step.metadata || {}), declined: { why, at: new Date().toISOString() } } })
            })
          }}>Not now</button>
      </>
    )
  }
  return (
    <>
      <button
        type="button"
        className={btn}
        title={isDone ? "Reopen" : "Mark done"}
        aria-label={`${isDone ? "Reopen" : "Mark done"}: ${step.title}`}
        aria-pressed={isDone}
        onClick={(e) => { e.stopPropagation(); onToggleComplete(step) }}
        style={isDone ? { color: "var(--opx-good,#307e59)" } : undefined}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      {/* An "only you" card is never sent to an agent, so it has no Start (lib/work/pipeline.ts startMove). */}
      {/* A closed card will not be done, so it is never sent to an agent either. */}
      {activeKey && !isDone && !isActive && step.work_kind !== "owner" && step.status !== "closed" && (
        <button
          type="button"
          className={btn}
          title="Start: send to an agent"
          aria-label={`Start: ${step.title}`}
          onClick={(e) => { e.stopPropagation(); if (onStart) void onStart(step.id); else onPatch(step.id, { status: activeKey }) }}
        >
          <Play className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      )}
      <button
        type="button"
        className={btn}
        title={flagged ? "Remove flag" : "Flag"}
        aria-label={`${flagged ? "Remove flag" : "Flag"}: ${step.title}`}
        aria-pressed={flagged}
        onClick={(e) => {
          e.stopPropagation()
          onPatch(step.id, { metadata: { ...(step.metadata || {}), flagged: !flagged } })
        }}
        style={flagged ? { color: "var(--opx-hot,#d65a3e)" } : undefined}
      >
        <Flag className="h-3.5 w-3.5" strokeWidth={2.25} fill={flagged ? "currentColor" : "none"} />
      </button>
      <span className="relative">
        <button
          type="button"
          className={btn}
          title="Set due date"
          aria-label={`Set due date: ${step.title}`}
          onClick={(e) => {
            e.stopPropagation()
            const el = dateRef.current
            if (!el) return
            if (typeof el.showPicker === "function") el.showPicker()
            else el.focus()
          }}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <input
          ref={dateRef}
          type="date"
          aria-label={`Due date: ${step.title}`}
          tabIndex={-1}
          defaultValue={step.end_date ? step.end_date.slice(0, 10) : ""}
          onChange={(e) => onPatch(step.id, { end_date: e.target.value || null })}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </span>
    </>
  )
}
