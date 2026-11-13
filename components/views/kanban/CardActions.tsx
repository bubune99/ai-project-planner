"use client"

/*
 * Quick actions on a board card (owner 2026-11-13): done, start, flag and
 * due date without opening the card. All four PATCH the step through the
 * board's own optimistic patchStep, so a failure reverts like a drag does.
 */

import { useRef } from "react"
import { Check, Play, Flag, CalendarDays } from "lucide-react"
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
}: {
  step: BoardStep
  isDone: boolean
  isActive: boolean
  /** Status key for "in progress"; null when the project has no such column. */
  activeKey: string | null
  onToggleComplete: (step: BoardStep) => void
  onPatch: (stepId: string, patch: Record<string, unknown>) => void
}) {
  const dateRef = useRef<HTMLInputElement>(null)
  const flagged = !!(step.metadata && (step.metadata as Record<string, unknown>).flagged)
  return (
    <>
      <button
        type="button"
        className={btn}
        title={isDone ? "Reopen" : "Mark done"}
        aria-label={isDone ? "Reopen" : "Mark done"}
        aria-pressed={isDone}
        onClick={(e) => { e.stopPropagation(); onToggleComplete(step) }}
        style={isDone ? { color: "var(--opx-good,#307e59)" } : undefined}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      {activeKey && !isDone && !isActive && (
        <button
          type="button"
          className={btn}
          title="Start"
          aria-label="Start"
          onClick={(e) => { e.stopPropagation(); onPatch(step.id, { status: activeKey }) }}
        >
          <Play className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      )}
      <button
        type="button"
        className={btn}
        title={flagged ? "Remove flag" : "Flag"}
        aria-label={flagged ? "Remove flag" : "Flag"}
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
          aria-label="Set due date"
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
          aria-label="Due date"
          tabIndex={-1}
          defaultValue={step.end_date ? step.end_date.slice(0, 10) : ""}
          onChange={(e) => onPatch(step.id, { end_date: e.target.value || null })}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </span>
    </>
  )
}
