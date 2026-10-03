"use client"

/*
 * AgentTrace — an agent run as a waterfall you can replay.
 *
 * Ported from the 21st.dev "Agent Trace" component (n1m4mz) and restyled to
 * the JARVIS tokens. Each row is a span (the run, a tool call, a delegated
 * specialist and its own calls, indented under it) placed on a shared time
 * axis, so you can see what ran when, what ran in parallel, and what failed.
 * Press play to replay the run: bars fill and statuses flip as the playhead
 * passes. Spans still running extend to `nowMs`.
 *
 * Differences from the original: React 18 (no ref-as-prop), a React-state
 * playhead instead of per-frame DOM writes (runs here are tens of spans, not
 * thousands), inline JARVIS colours instead of shadcn theme tokens.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, CircleAlert, Pause, Play, Wrench } from "lucide-react"
import { layoutSpans, formatMs, type AgentSpan } from "@/lib/agents/trace"

const NICE_TICKS = [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10_000, 30_000, 60_000]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function AgentTrace({ spans, nowMs, title }: { spans: AgentSpan[]; nowMs?: number; title?: string }) {
  const rows = useMemo(
    () => layoutSpans(spans).map((s) => ({ ...s, endAt: s.end ?? Math.max(s.start, nowMs ?? s.start) })),
    [spans, nowMs],
  )
  const total = Math.max(1, ...rows.map((r) => r.endAt))
  const running = rows.some((r) => r.status === "running")
  const ticks = useMemo(() => {
    const step = NICE_TICKS.find((t) => total / t <= 6) ?? total / 4
    const out: number[] = []
    for (let t = step; t < total; t += step) out.push(t)
    return out
  }, [total])

  // Playhead: null means "show the run as it is now" (live or finished).
  const [t, setT] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!playing) return
    const frame = (now: number) => {
      const dt = Math.min(now - (last.current || now), 100)
      last.current = now
      setT((prev) => {
        const next = (prev ?? 0) + dt
        if (next >= total) { setPlaying(false); return null }
        return next
      })
      raf.current = requestAnimationFrame(frame)
    }
    last.current = 0
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, total])

  const head = t ?? total
  const play = () => { if (playing) { setPlaying(false); return } ; setT(0); setPlaying(true) }
  const seek = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setPlaying(false)
    setT(clamp(((clientX - r.left) / r.width) * total, 0, total))
  }
  const sel = rows.find((r) => r.id === selected)

  const GUTTER = "min(220px, 40%)"
  const META = "92px"

  return (
    <div style={{ borderRadius: 12, background: "var(--j-surface)", boxShadow: "0 0 0 1px var(--j-ring)", overflow: "hidden", fontSize: 12 }}>
      <div className="j-row" style={{ gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--j-hairline)", alignItems: "center" }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: running ? "var(--j-accent)" : "oklch(0.45 0 0)" }} />
        <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontWeight: 500 }}>{title ?? "Agent run"}</span>
        <span className="j-muted">{rows.length} steps · {formatMs(total)}</span>
        <span className="j-pill j-ghost" style={{ marginLeft: "auto", fontSize: 10.5 }}>{running ? "Running" : "Completed"}</span>
      </div>

      <div style={{ position: "relative" }}>
        {/* Ruler */}
        <div style={{ display: "flex", height: 24, borderBottom: "1px solid var(--j-hairline)", padding: "0 12px" }}>
          <div style={{ width: GUTTER, flexShrink: 0 }} />
          <div style={{ position: "relative", flex: 1, cursor: "ew-resize" }} onPointerDown={(e) => seek(e.clientX, e.currentTarget)}>
            {ticks.map((tk) => (
              <span key={tk} className="j-muted" style={{ position: "absolute", top: 6, left: `${(tk / total) * 100}%`, transform: "translateX(-50%)", fontSize: 10, fontFamily: "var(--font-geist-mono, monospace)" }}>
                {tk < 1000 ? `${tk}ms` : `${tk / 1000}s`}
              </span>
            ))}
          </div>
          <div style={{ width: META, flexShrink: 0 }} />
        </div>

        <ol aria-label="Steps in this run" style={{ listStyle: "none", margin: 0, padding: "4px 0" }}>
          {rows.map((r) => {
            const dur = r.endAt - r.start
            const p = dur > 0 ? clamp((head - r.start) / dur, 0, 1) : head >= r.start ? 1 : 0
            const state = head < r.start ? "queued" : r.status === "running" && t === null ? "running" : p < 1 ? "running" : r.status
            const isAgent = r.kind === "agent"
            const fill = r.status === "error" ? "var(--j-neg)" : isAgent ? "var(--j-accent)" : "oklch(1 0 0 / 0.45)"
            const Icon = isAgent ? Bot : Wrench
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => { setSelected(r.id); setPlaying(false); setT(r.start) }}
                  aria-label={`${r.title}, ${formatMs(dur)}, ${state === "error" ? "failed" : state}`}
                  style={{
                    display: "flex", alignItems: "center", width: "100%", height: 30, padding: "0 12px",
                    background: selected === r.id ? "oklch(1 0 0 / 0.04)" : "transparent", border: "none", color: "inherit", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ width: GUTTER, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, paddingLeft: r.depth * 14, minWidth: 0, opacity: state === "queued" ? 0.45 : 1 }}>
                    <Icon aria-hidden size={13} style={{ flexShrink: 0, color: isAgent ? "var(--j-accent)" : "oklch(0.6 0 0)" }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                  </span>
                  <span style={{ position: "relative", flex: 1, height: "100%" }}>
                    <span style={{ position: "absolute", top: "50%", height: 8, transform: "translateY(-50%)", left: `${(r.start / total) * 100}%`, width: `max(3px, ${(dur / total) * 100}%)`, borderRadius: 99, overflow: "hidden", background: "oklch(1 0 0 / 0.08)" }}>
                      <span style={{ position: "absolute", inset: 0, background: fill, transformOrigin: "left", transform: `scaleX(${p})` }} />
                    </span>
                  </span>
                  <span style={{ width: META, flexShrink: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, fontFamily: "var(--font-geist-mono, monospace)", fontSize: 11, opacity: state === "queued" ? 0 : 1 }}>
                    {r.status === "error" && <CircleAlert aria-hidden size={12} style={{ color: "var(--j-neg)" }} />}
                    <span style={{ color: r.status === "error" ? "var(--j-neg)" : "oklch(0.75 0 0)" }}>{formatMs(dur * p)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* Playhead */}
        <div aria-hidden style={{ position: "absolute", top: 24, bottom: 0, left: `calc(12px + ${GUTTER})`, right: `calc(12px + ${META})`, pointerEvents: "none" }}>
          <span style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: `${(head / total) * 100}%`, background: "var(--j-accent)", opacity: 0.7 }} />
        </div>
      </div>

      {sel && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--j-hairline)", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontWeight: 500 }}>{sel.title}</strong>
          <span className="j-muted" style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>{sel.label}</span>
          {sel.detail && <span style={{ color: sel.status === "error" ? "var(--j-neg)" : "oklch(0.8 0 0)" }}>{sel.detail}</span>}
          {sel.tokens != null && <span className="j-muted">{sel.tokens.toLocaleString("en-US")} tokens</span>}
          <span className="j-muted">starts {formatMs(sel.start)} · took {formatMs(sel.endAt - sel.start)}</span>
        </div>
      )}

      <div className="j-row" style={{ gap: 10, padding: "8px 12px", borderTop: "1px solid var(--j-hairline)", alignItems: "center" }}>
        <button type="button" onClick={play} disabled={running} aria-label={playing ? "Pause replay" : "Replay the run"} className="j-btn j-btn-icon" style={{ borderRadius: 99, width: 30, height: 30 }}>
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <div
          role="slider" tabIndex={0} aria-label="Playhead" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(head)}
          onPointerDown={(e) => seek(e.clientX, e.currentTarget)}
          onKeyDown={(e) => {
            const step = total / 50
            if (e.key === "ArrowRight") { setPlaying(false); setT(clamp(head + step, 0, total)) }
            else if (e.key === "ArrowLeft") { setPlaying(false); setT(clamp(head - step, 0, total)) }
            else if (e.key === "End") { setPlaying(false); setT(null) }
            else if (e.key === "Home") { setPlaying(false); setT(0) }
          }}
          style={{ position: "relative", flex: 1, height: 20, cursor: "ew-resize" }}
        >
          <span style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 4, transform: "translateY(-50%)", borderRadius: 99, background: "oklch(1 0 0 / 0.08)", overflow: "hidden" }}>
            <span style={{ position: "absolute", inset: 0, background: "var(--j-accent)", transformOrigin: "left", transform: `scaleX(${head / total})` }} />
          </span>
        </div>
        <span className="j-muted" style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 11, minWidth: 92, textAlign: "right" }}>
          {formatMs(head)} / {formatMs(total)}
        </span>
      </div>
    </div>
  )
}
