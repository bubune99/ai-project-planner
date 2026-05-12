"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"

const QUICK_STARTS = [
  { label: "Review my open todos", query: "What are my open todos? Summarize them and suggest what to focus on today." },
  { label: "Summarize active projects", query: "Give me a brief status summary of my active projects." },
  { label: "Capture a new idea", query: "Help me flesh out a new idea. Ask me questions to refine it." },
  { label: "Weekly planning", query: "Help me plan my week. What should I prioritize based on my projects and todos?" },
]

export const Greeting = () => {
  const router = useRouter()

  const sendQuery = (query: string) => {
    router.push(`/chat?query=${encodeURIComponent(query)}`)
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flex: 1, padding: "32px 24px", gap: 24,
    }}>
      {/* Logo mark */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          width: 52, height: 52, borderRadius: 13,
          background: "oklch(0.870 0.045 252 / 0.15)",
          boxShadow: "0 0 0 1px oklch(0.870 0.045 252 / 0.3), 0 0 32px oklch(0.870 0.045 252 / 0.12)",
          display: "grid", placeItems: "center", fontSize: 22,
        }}
      >
        ◈
      </motion.div>

      <div style={{ textAlign: "center" }}>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--j-accent)", margin: "0 0 8px" }}
        >
          Central Nervous System
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 6px", color: "oklch(0.985 0 0)" }}
        >
          JARVIS is ready
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{ fontSize: 14, color: "oklch(0.556 0 0)", margin: 0 }}
        >
          Ask anything about your projects, todos, and ideas.
        </motion.p>
      </div>

      {/* Quick-start buttons */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 480, width: "100%" }}
      >
        {QUICK_STARTS.map(({ label, query }) => (
          <button
            key={label}
            onClick={() => sendQuery(query)}
            style={{
              background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)",
              borderRadius: 9, padding: "10px 14px", textAlign: "left",
              fontSize: 13, color: "oklch(0.780 0 0)", cursor: "pointer",
              fontFamily: "inherit", lineHeight: 1.4, transition: "background 0.12s, border-color 0.12s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.870 0.045 252 / 0.08)"
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.870 0.045 252 / 0.4)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.04)"
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--j-ring)"
            }}
          >
            {label}
          </button>
        ))}
      </motion.div>
    </div>
  )
}
