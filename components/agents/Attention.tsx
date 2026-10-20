"use client"

/*
 * Attention — how the agent points at the screen.
 *   highlight = work being done / things to review: a ring and one tag, no dimming, clears itself.
 *   spotlight = tutorials only: dims everything except one control, waits for the person
 *               (Back / Next / Skip / Stop, "Got it" on the last step). Never advances on its own.
 * One state at a time (data-attention on the root: idle | highlight | spotlight).
 * Targets are found by data-ui (lib/ade/ui/planner-units.ts); a missing or hidden target is
 * reported in plain words, never faked.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ACK_EVENT, ATTENTION_EVENT, TOUR_EVENT, type PointDetail, type TourStep,
} from "@/lib/ade/ui/attention-events"
import { resolveUnit } from "@/lib/ade/ui/control"
import { scanUnits } from "@/lib/ade/ui/scan"

type Mode = "idle" | "highlight" | "spotlight"
interface Shown { key: string; caption: string; step?: { n: number; of: number } }

/** The key to point at: an explicit one if it is on screen, else the visible control whose label matches the asked words. */
function resolveKey(d: PointDetail): string | null {
  if (d.key && document.querySelector(`[data-ui="${d.key}"]`)) return d.key
  if (!d.ask) return null
  const units = scanUnits(document, 200).map((u) => ({ key: u.key, label: u.label, selector: `[data-ui="${u.key}"]`, aliases: [] as string[] }))
  return resolveUnit(d.ask, units)?.key ?? null
}

const find = (key: string): HTMLElement | null => {
  const found = document.querySelector<HTMLElement>(`[data-ui="${key}"]`)
  // A section heading stands for its whole card.
  const el = key.startsWith("section.") ? ((found?.closest(".j-card") as HTMLElement | null) ?? found) : found
  if (!el) return null
  const r = el.getBoundingClientRect()
  const hidden = r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden"
  return hidden ? null : el
}

export function Attention() {
  const [mode, setMode] = useState<Mode>("idle")
  const [shown, setShown] = useState<Shown | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const steps = useRef<ReadonlyArray<TourStep>>([])
  const index = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setMode("idle"); setShown(null); setRect(null)
  }, [])

  const target = useRef<HTMLElement | null>(null)
  const measure = useCallback(() => { if (target.current) setRect(target.current.getBoundingClientRect()) }, [])

  const show = useCallback((key: string, caption: string, m: Mode, step?: Shown["step"]) => {
    const el = find(key)
    if (!el) return false
    target.current = el
    el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" })
    setShown({ key, caption, step })
    setMode(m)
    setTimeout(measure, 350)
    measure()
    return true
  }, [measure])

  const notOnScreen = useCallback((label: string) => {
    setNote(`${label} isn't on this screen right now.`)
    setTimeout(() => setNote(null), 4000)
  }, [])

  const goStep = useCallback((from: number, dir: 1 | -1) => {
    let i = from
    while (i >= 0 && i < steps.current.length) {
      const s = steps.current[i]
      if (show(s.key, s.caption, "spotlight", { n: i + 1, of: steps.current.length })) { index.current = i; return }
      i += dir
    }
    clear()
  }, [show, clear])

  useEffect(() => {
    const onPoint = (e: Event) => {
      const d = (e as CustomEvent<PointDetail>).detail
      if (!d?.key && !d?.ask) return
      steps.current = []
      const key = resolveKey(d)
      if (!key || !show(key, d.caption ?? "", d.mode === "spotlight" ? "spotlight" : "highlight")) { notOnScreen(d.ask ?? "That part"); return }
      if (d.mode !== "spotlight") timer.current = setTimeout(clear, 7000)
    }
    const onTour = (e: Event) => {
      const s = (e as CustomEvent<{ steps: ReadonlyArray<TourStep> }>).detail?.steps
      if (!s?.length) return
      steps.current = s
      goStep(0, 1)
    }
    window.addEventListener(ATTENTION_EVENT, onPoint)
    window.addEventListener(TOUR_EVENT, onTour)
    return () => { window.removeEventListener(ATTENTION_EVENT, onPoint); window.removeEventListener(TOUR_EVENT, onTour) }
  }, [show, goStep, clear, notOnScreen])

  useEffect(() => {
    if (mode === "idle") return
    const key = (e: KeyboardEvent) => e.key === "Escape" && clear()
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true); window.addEventListener("keydown", key)
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); window.removeEventListener("keydown", key) }
  }, [mode, measure, clear])

  const ack = (action: "gotit" | "skip" | "stop") => {
    window.dispatchEvent(new CustomEvent(ACK_EVENT, { detail: { key: shown?.key, action } }))
    clear()
  }
  const isTour = steps.current.length > 0
  const last = isTour && index.current >= steps.current.length - 1

  return (
    <div data-fbw="attention" data-attention={mode} style={{ position: "fixed", inset: 0, zIndex: 2147483644, pointerEvents: "none" }}>
      {note && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 88, transform: "translateX(-50%)", background: "oklch(0.2 0 0)", color: "oklch(0.95 0 0)", border: "1px solid var(--j-ring)", borderRadius: 999, padding: "8px 14px", fontSize: 13 }}>
          {note}
        </div>
      )}
      {mode !== "idle" && rect && (
        <>
          <div
            aria-hidden
            style={{
              position: "fixed", left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
              borderRadius: 12, border: "2px solid var(--j-accent)", transition: "all .2s ease",
              boxShadow: mode === "spotlight" ? "0 0 0 9999px rgba(0,0,0,.66)" : "0 0 0 4px oklch(0.870 0.045 252 / 0.25)",
            }}
          />
          {mode === "spotlight" && <div style={{ position: "fixed", inset: 0, pointerEvents: "auto" }} onClick={() => undefined} />}
          {(shown?.caption || mode === "spotlight") && (
            <div
              role={mode === "spotlight" ? "dialog" : "status"}
              style={{
                position: "fixed", pointerEvents: "auto", maxWidth: "min(320px, calc(100vw - 24px))",
                left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
                top: rect.bottom + 14 + 150 > window.innerHeight ? Math.max(12, rect.top - 14 - (mode === "spotlight" ? 150 : 44)) : rect.bottom + 14,
                background: "oklch(0.2 0 0)", color: "oklch(0.96 0 0)", border: "1px solid var(--j-ring)", borderRadius: 12,
                padding: "10px 12px", fontSize: 13, lineHeight: 1.45, boxShadow: "0 12px 30px rgba(0,0,0,.5)",
              }}
            >
              {shown?.step && <div style={{ fontSize: 11, color: "oklch(0.65 0 0)", marginBottom: 4 }}>{shown.step.n} of {shown.step.of}</div>}
              <div>{shown?.caption}</div>
              {mode === "spotlight" && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {isTour && index.current > 0 && <button type="button" style={chip} onClick={() => goStep(index.current - 1, -1)}>Back</button>}
                  {isTour && !last && <button type="button" style={chip} onClick={() => ack("skip")}>Skip</button>}
                  <button type="button" style={chip} onClick={() => ack("stop")}>Stop</button>
                  <button
                    type="button"
                    style={{ ...chip, background: "var(--j-accent)", color: "oklch(0.15 0 0)", border: 0, fontWeight: 600, marginLeft: "auto" }}
                    onClick={() => (isTour && !last ? goStep(index.current + 1, 1) : ack("gotit"))}
                  >
                    {isTour && !last ? "Next" : "Got it"}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  background: "transparent", border: "1px solid var(--j-ring)", borderRadius: 8, color: "oklch(0.9 0 0)",
  minHeight: 36, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
}
