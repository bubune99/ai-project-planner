"use client"

/**
 * Swipe the page down to refresh, on a phone. The rules are in lib/shell/pull-refresh.ts; this reads the page and
 * draws the indicator. Mounted once by the app shell, phone widths only.
 */
import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { mayPull, onRelease, pullArmed, pullIntent, pullOffset, PULL_THRESHOLD } from "@/lib/shell/pull-refresh"

const FIELD = "input, textarea, select, [contenteditable=''], [contenteditable='true']"
const DRAGGED = "[data-kanban-card], [draggable='true'], [data-rfd-draggable-id], [data-rfd-drag-handle-draggable-id], .react-flow, canvas, [role='slider'], [data-no-pull]"
const OVERLAY = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper]"

/** Does anything between the touched element and the page's own scroller scroll by itself? */
function insideScrollPanel(el: Element | null, page: Element | null): boolean {
  for (let e = el; e && e !== page && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e)
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 1) return true
  }
  return false
}

export function PullToRefresh({ onRefresh, busy }: { onRefresh: () => void; busy: boolean }) {
  const [offset, setOffset] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const g = useRef<{ x: number; y: number; state: "wait" | "pull" | "leave"; dy: number } | null>(null)
  const typed = useRef(false)
  const warnedAt = useRef<number | null>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  // A refresh that has finished leaves nothing typed and nothing warned about.
  useEffect(() => { if (!busy) { typed.current = false; warnedAt.current = null } }, [busy])

  useEffect(() => {
    const page = () => document.querySelector("main")
    // Words typed into a search or filter box are not work that could be lost.
    const looksUp = (el: Element) => el.matches("[type='search'], [role='searchbox'], [role='combobox']") || /search|find|filter|jump/i.test(`${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`)
    const onInput = (e: Event) => { const el = e.target as Element | null; if (el?.closest?.("main") && !looksUp(el)) typed.current = true }
    const start = (e: TouchEvent) => {
      g.current = null
      if (e.touches.length !== 1) return
      const el = e.target as Element | null, main = page()
      const ok = mayPull({
        atTop: window.scrollY <= 0 && (main ? main.scrollTop <= 0 : true),
        inScrollPanel: insideScrollPanel(el, main),
        overlayOpen: !!document.querySelector(OVERLAY),
        onDraggable: !!el?.closest?.(DRAGGED),
        inField: !!el?.closest?.(FIELD) || !!document.activeElement?.matches?.(FIELD),
        busy: busyRef.current,
      })
      if (ok) g.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, state: "wait", dy: 0 }
    }
    const move = (e: TouchEvent) => {
      const s = g.current
      if (!s || s.state === "leave") return
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y
      if (s.state === "wait") { s.state = pullIntent(dx, dy); if (s.state !== "pull") return }
      s.dy = dy
      if (e.cancelable) e.preventDefault()          // the page must not also scroll or bounce under the finger
      setOffset(pullOffset(dy))
    }
    const end = () => {
      const s = g.current
      g.current = null
      if (!s || s.state !== "pull") return
      setOffset(0)
      const what = onRelease({ dy: s.dy, unsavedTyping: typed.current, warnedAt: warnedAt.current, now: Date.now() })
      if (what === "warn") {
        warnedAt.current = Date.now()
        setNote("You have typing on this page that is not saved. Swipe down again to refresh anyway.")
        window.setTimeout(() => setNote(null), 8000)
      } else if (what === "refresh") { setNote(null); onRefresh() }
    }
    document.addEventListener("input", onInput, true)
    document.addEventListener("touchstart", start, { passive: true })
    document.addEventListener("touchmove", move, { passive: false })
    document.addEventListener("touchend", end)
    document.addEventListener("touchcancel", end)
    return () => {
      document.removeEventListener("input", onInput, true)
      document.removeEventListener("touchstart", start)
      document.removeEventListener("touchmove", move)
      document.removeEventListener("touchend", end)
      document.removeEventListener("touchcancel", end)
    }
  }, [onRefresh])

  const shown = busy ? PULL_THRESHOLD : offset
  const armed = pullArmed(g.current?.dy ?? 0)
  return (
    <>
      <div className={`opx-pull${busy ? " busy" : ""}${shown > 0 ? " on" : ""}`} style={{ transform: `translate(-50%, ${shown - 56}px)` }} role="status" aria-live="polite" data-pull-offset={shown}>
        <RefreshCw size={16} aria-hidden="true" style={busy ? undefined : { transform: `rotate(${Math.round((shown / PULL_THRESHOLD) * 270)}deg)` }} />
        <span>{busy ? "Refreshing" : shown === 0 ? "" : armed ? "Let go to refresh" : "Swipe down to refresh"}</span>
      </div>
      {note && <div className="opx-pull-note" role="alert">{note}</div>}
    </>
  )
}
