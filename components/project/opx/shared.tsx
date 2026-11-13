"use client"

/*
 * Small shared pieces for the redesigned project tabs (opx = the OpEx /
 * Health & Habits system). Colors come from the --opx-* tokens in
 * app/opx-skin.css, so light and dark both work.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/** GET a JSON endpoint; `data` is the parsed body or null. `reload` refetches. */
export function useJson<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`)
        return j
      })
      .then((j) => { if (!cancelled) { setData(j); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}

/** Unwrap the planner's { success, data } envelope or the raw shape. */
export const unwrap = <T,>(j: any, key?: string): T => (key ? (j?.[key] ?? j?.data?.[key] ?? j?.data) : (j?.data ?? j)) as T

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  if (!d) return ""
  const x = typeof d === "string" ? new Date(d) : d
  return Number.isNaN(+x) ? "" : x.toLocaleDateString("en-US", opts)
}

export function ago(d: string | null | undefined): string {
  if (!d) return ""
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 2) return "yesterday"
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)}mo ago`
  return `${Math.floor(s / 86400 / 365)}y ago`
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "To do", "in-progress": "In progress", in_progress: "In progress", completed: "Done", blocked: "Blocked", paused: "Paused", failed: "Failed",
}
export const STATUS_COLOR: Record<string, string> = {
  pending: "#8a94a3", "in-progress": "var(--opx-accent)", in_progress: "var(--opx-accent)", completed: "var(--opx-good)", blocked: "var(--opx-hot)", paused: "var(--opx-warn)", failed: "var(--opx-hot)",
}
const PRI_COLOR: Record<string, string> = { urgent: "var(--opx-hot)", critical: "var(--opx-hot)", high: "var(--opx-warn)", medium: "var(--opx-accent)", low: "#8a94a3" }

export function Priority({ p }: { p?: string | null }) {
  if (!p) return null
  const k = p.toLowerCase()
  return (
    <span className="opx-row" style={{ gap: 5, fontSize: 12.5, color: "var(--opx-title)" }}>
      <i className="opx-dot" style={{ background: PRI_COLOR[k] || "#8a94a3", width: 7, height: 7 }} />
      {k.charAt(0).toUpperCase() + k.slice(1)}
    </span>
  )
}

export function Md({ text }: { text: string }) {
  return (
    <div className="opx-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

export function Section({ title, count, action, children, style }: { title?: ReactNode; count?: number | string; action?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section className="opx-sec" style={style}>
      {(title || action) && (
        <div className="opx-sech">
          {title && <h2>{title}</h2>}
          {count != null && <span className="opx-n">{count}</span>}
          {action && <span style={{ marginLeft: "auto" }}>{action}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="opx-seg" role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={k === value} className={k === value ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return <div className="opx-empty">Loading {what}…</div>
}
export function Failed({ what, error, retry }: { what: string; error: string; retry?: () => void }) {
  return (
    <div className="opx-empty">
      Couldn't load {what}: {error}{" "}
      {retry && <button className="opx-btn sm" onClick={retry}>Try again</button>}
    </div>
  )
}

/** Hover popover for long descriptions; render <HoverTip/> once, attach with tipProps(text). */
export function useHoverTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const tipProps = (text: string | null | undefined) =>
    text
      ? {
          onMouseEnter: (e: React.MouseEvent) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setTip({ text: text.slice(0, 700), x: Math.min(r.left + 24, window.innerWidth - 440), y: Math.min(r.bottom + 6, window.innerHeight - 220) })
          },
          onMouseLeave: () => setTip(null),
        }
      : {}
  const node = tip ? <div className="opx-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null
  return { tipProps, node }
}

/** Send a prefilled prompt to the assistant sheet. */
export function askAssistant(text: string) {
  window.dispatchEvent(new CustomEvent("jarvis:sheet", { detail: { text } }))
}
