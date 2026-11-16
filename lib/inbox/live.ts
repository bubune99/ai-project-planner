"use client"

/**
 * The inbox count, kept live.
 *
 * Owner, 2026-11-16: "Inbox count needs a better refresh when I actual click something. Should be live state."
 * The count in the top bar, the menu and the phone's Inbox tab was read once per page: answering a question left the
 * old number until the next page. Every place that answers, takes back or raises an inbox item calls
 * `announceInbox`, and every place that shows the count uses `useInboxCount`.
 */
import { useEffect, useState } from "react"
import { countAfter } from "./count"

const EVENT = "inbox:changed"

/** Say that the inbox changed. `delta` is what is already known (-1: one was just answered; +1: one came back). */
export function announceInbox(delta = 0): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { delta } }))
}

/** How many things wait on the owner: right at once after a press here, and within half a minute of anything else. */
export function useInboxCount(key?: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true, seq = 0
    const read = () => {
      const mine = ++seq
      fetch("/api/inbox", { credentials: "include", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        // A late answer to an older read never overwrites a newer one.
        .then((j) => { if (alive && mine === seq && j && Array.isArray(j.data)) setCount(j.data.length) })
        .catch(() => { /* the last known number stays */ })
    }
    const changed = (e: Event) => { const d = Number((e as CustomEvent<{ delta?: number }>).detail?.delta) || 0; if (d) setCount((c) => countAfter(c, d)); read() }
    const seen = () => { if (document.visibilityState === "visible") read() }
    read()
    window.addEventListener(EVENT, changed)
    window.addEventListener("focus", seen)
    document.addEventListener("visibilitychange", seen)
    const every = window.setInterval(seen, 30_000)
    return () => { alive = false; window.removeEventListener(EVENT, changed); window.removeEventListener("focus", seen); document.removeEventListener("visibilitychange", seen); window.clearInterval(every) }
  }, [key])
  return count
}
