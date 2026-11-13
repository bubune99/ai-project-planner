"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { startTour } from "@/lib/ade/ui/attention-events"
import { briefingLine } from "@/lib/ade/briefing"

/** The one set of starters (the old SuggestedActions list is gone). */
export const STARTERS = [
  { label: "Catch me up on my shared projects", hint: "What changed and what needs you" },
  { label: "What do I need to do next?", hint: "Your todos and open steps" },
  { label: "What changed since I was last here?", hint: "New activity across projects" },
  { label: "Show me around the planner", hint: "A short walkthrough", tour: true },
]

/** The one-line briefing: real counts from the person's own todos. Plain text when the numbers are not available. */
function useBriefing(): string | null {
  const [line, setLine] = useState<string | null>(null)
  useEffect(() => {
    let off = false
    fetch("/api/ade/briefing", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!off) setLine(briefingLine(j)) })
      .catch(() => {})
    return () => { off = true }
  }, [])
  return line
}

export const Greeting = ({ onPick, wide }: { onPick?: (text: string) => void; agentName?: string; wide?: boolean }) => {
  const briefing = useBriefing()
  return (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 4px 8px", width: "100%" }}>
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ textAlign: "center" }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 6px", color: "var(--opx-ink)" }}>
        How can I help?
      </h2>
      <p style={{ fontSize: 14, color: "var(--opx-muted)", margin: 0 }}>{briefing ?? "Ask about any project, or tell me what to plan."}</p>
    </motion.div>

    <div data-testid="suggested-actions" style={{ display: "grid", gap: 8, width: "100%", maxWidth: wide ? 680 : 520, gridTemplateColumns: wide ? "1fr 1fr" : "1fr" }}>
      {STARTERS.map(({ label, hint, tour }, i) => (
        <motion.button
          key={label}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          data-ui={`chat.starter.${i}`}
          onClick={() => (tour ? startTour() : onPick?.(label))}
          style={{
            display: "block", textAlign: "left", width: "100%", minHeight: 52,
            background: "var(--opx-soft)", border: 0, borderRadius: 16,
            padding: "12px 16px", color: "var(--opx-ink)", cursor: "pointer", fontFamily: "inherit",
            touchAction: "manipulation",
          }}
        >
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{label}</span>
          <span style={{ display: "block", fontSize: 12.5, color: "var(--opx-muted)", marginTop: 2 }}>{hint}</span>
        </motion.button>
      ))}
    </div>
  </div>
  )
}
