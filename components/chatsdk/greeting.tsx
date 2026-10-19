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

export const Greeting = ({ onPick, agentName = "JARVIS", wide }: { onPick?: (text: string) => void; agentName?: string; wide?: boolean }) => {
  const briefing = useBriefing()
  return (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 4px 8px", width: "100%" }}>
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ textAlign: "center" }}>
      <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--j-accent)", margin: "0 0 6px" }}>
        Central Nervous System
      </p>
      <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 4px", color: "oklch(0.985 0 0)" }}>
        {agentName} is ready
      </h2>
      <p style={{ fontSize: 13, color: "oklch(0.62 0 0)", margin: 0 }}>{briefing ?? "Ask anything, or start here."}</p>
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
            background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 12,
            padding: "10px 14px", color: "oklch(0.9 0 0)", cursor: "pointer", fontFamily: "inherit",
            touchAction: "manipulation",
          }}
        >
          <span style={{ display: "block", fontSize: 14, lineHeight: 1.3 }}>{label}</span>
          <span style={{ display: "block", fontSize: 11.5, color: "oklch(0.58 0 0)", marginTop: 2 }}>{hint}</span>
        </motion.button>
      ))}
    </div>
  </div>
  )
}
