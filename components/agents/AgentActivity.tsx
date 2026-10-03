"use client"

/*
 * AgentActivity — what the agent is doing, inside its reply.
 *
 * Thought-Chain style (after the 21st.dev "Thought Chain" by odysseyui): each
 * tool call or delegated specialist appears as a step the moment it starts —
 * spinner while running, check when done, red when it failed — with the
 * specialist's own steps nested under it. When the run finishes it folds to
 * "Used 4 tools · 6.2s"; open it to see the steps, or the timeline for when
 * each one ran.
 *
 * Fed by the data-span parts the chat route streams (lib/agents/trace.ts).
 * Before this, the planner tools rendered nothing: a 40-second answer was 40
 * seconds of a blank "Thinking...".
 */

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { layoutSpans, traceTotals, formatMs, type AgentSpan } from "@/lib/agents/trace"
import { AgentTrace } from "./AgentTrace"

function useNow(active: boolean, startedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const iv = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(iv)
  }, [active])
  return now - startedAt
}

export function AgentActivity({ spans }: { spans: AgentSpan[] }) {
  const root = spans.find((s) => !s.parentId && s.kind === "agent")
  const steps = useMemo(() => layoutSpans(spans).filter((s) => s.id !== root?.id), [spans, root?.id])
  const running = spans.some((s) => s.status === "running")
  // Wall-clock anchor for the live timer: the moment this component first saw the run.
  const [seenAt] = useState(() => Date.now())
  const liveMs = useNow(running, seenAt)
  const totals = traceTotals(spans, running ? liveMs : undefined)

  const [userToggled, setUserToggled] = useState<boolean | null>(null)
  const open = userToggled ?? running
  const [timeline, setTimeline] = useState(false)

  // A reply with no tool calls has nothing to show once it is done.
  if (!steps.length && !running) return null

  const current = [...steps].reverse().find((s) => s.status === "running")
  const rootDepth = root ? 1 : 0

  return (
    <div style={{ margin: "2px 0 8px", fontSize: 13 }} data-slot="agent-activity">
      <div className="j-row" style={{ gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setUserToggled(!open)}
          aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", padding: "2px 0", color: "oklch(0.72 0 0)", cursor: "pointer", fontSize: 13 }}
        >
          {running ? (
            <Loader2 aria-hidden size={14} className="animate-spin" style={{ color: "var(--j-accent)" }} />
          ) : totals.errors ? (
            <X aria-hidden size={14} style={{ color: "var(--j-neg)" }} />
          ) : (
            <Check aria-hidden size={14} style={{ color: "var(--j-pos)" }} />
          )}
          <span>
            {running
              ? current ? current.title : "Working"
              : `Used ${totals.tools} tool${totals.tools === 1 ? "" : "s"} · ${formatMs(totals.ms)}`}
            {!running && totals.errors > 0 && <span style={{ color: "var(--j-neg)" }}> · {totals.errors} failed</span>}
          </span>
          <ChevronDown aria-hidden size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
        {steps.length > 0 && (
          <button type="button" onClick={() => setTimeline(true)} className="j-btn j-btn-ghost" style={{ fontSize: 11.5, padding: "2px 8px" }}>
            Timeline
          </button>
        )}
      </div>

      {open && steps.length > 0 && (
        <ol style={{ listStyle: "none", margin: "6px 0 0", padding: "0 0 0 6px", borderLeft: "1px solid var(--j-hairline)" }}>
          {steps.map((s) => {
            const dur = (s.end ?? (running ? liveMs : s.start)) - s.start
            return (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0 3px", paddingLeft: 8 + Math.max(0, s.depth - rootDepth) * 16 }}>
                {s.status === "running" ? (
                  <Loader2 aria-label="running" size={12} className="animate-spin" style={{ color: "var(--j-accent)", flexShrink: 0 }} />
                ) : s.status === "error" ? (
                  <X aria-label="failed" size={12} style={{ color: "var(--j-neg)", flexShrink: 0 }} />
                ) : (
                  <Check aria-label="done" size={12} style={{ color: "var(--j-pos)", flexShrink: 0 }} />
                )}
                <span style={{ color: s.status === "running" ? "oklch(0.92 0 0)" : "oklch(0.72 0 0)", fontWeight: s.kind === "agent" ? 500 : 400, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title}
                </span>
                {s.detail && (
                  <span style={{ color: s.status === "error" ? "var(--j-neg)" : "oklch(0.55 0 0)", fontSize: 12, whiteSpace: "nowrap" }}>{s.detail}</span>
                )}
                <span style={{ marginLeft: "auto", color: "oklch(0.5 0 0)", fontSize: 11, fontFamily: "var(--font-geist-mono, monospace)", flexShrink: 0 }}>
                  {formatMs(Math.max(0, dur))}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <Dialog open={timeline} onOpenChange={setTimeline}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>What the agent did</DialogTitle>
          </DialogHeader>
          <AgentTrace spans={spans} nowMs={running ? liveMs : undefined} title={root?.title} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
