"use client"

/**
 * The inbox, kept live and read once.
 *
 * Owner, 2026-11-16: "Inbox count needs a better refresh when I actual click something. Should be live state."
 * The count in the top bar, the menu and the phone's Inbox tab was read once per page: answering a question left the
 * old number until the next page. Every place that answers, takes back or raises an inbox item calls
 * `announceInbox`, and every place that shows the count uses `useInboxCount`.
 *
 * One read serves the page (2026-11-23): the sidebar, the top bar and the page each asked /api/inbox for themselves,
 * two to four times on every page load at about a second each. Reads now go through `readInbox`, which joins a read
 * already on its way and reuses one made in the last moment (`reuseRead`); every reader hears every answer.
 */
import { useCallback, useEffect, useState } from "react"
import { countAfter, reuseRead } from "./count"

const EVENT = "inbox:changed"

/** Say that the inbox changed. `delta` is what is already known (-1: one was just answered; +1: one came back). */
export function announceInbox(delta = 0): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { delta } }))
}

type Body = { data?: unknown[] } & Record<string, unknown>
let last: { at: number; body: Body } | null = null
let pending: Promise<Body | null> | null = null
const listeners = new Set<(body: Body) => void>()

/** The inbox as the server sends it ({ data: [...] }), read at most once at a time and shared by every reader. */
export function readInbox(force = false): Promise<Body | null> {
  if (reuseRead(last, Date.now(), force)) return Promise.resolve(last!.body)
  if (pending) return pending
  pending = fetch("/api/inbox", { credentials: "include", cache: "no-store" })
    .then(async (r) => {
      const j = (await r.json().catch(() => null)) as Body | null
      if (!r.ok || !j) throw new Error((j as any)?.error?.message || (j as any)?.error || `HTTP ${r.status}`)
      last = { at: Date.now(), body: j }
      listeners.forEach((hear) => hear(j))
      return j
    })
    .finally(() => { pending = null })
  return pending
}

function listen(hear: (body: Body) => void): () => void {
  listeners.add(hear)
  return () => { listeners.delete(hear) }
}

/** How many things wait on the owner: right at once after a press here, and within half a minute of anything else. */
export function useInboxCount(key?: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const show = (j: Body) => { if (alive && Array.isArray(j.data)) setCount(j.data.length) }
    const stop = listen(show)
    const read = (force = false) => { readInbox(force).then((j) => { if (j) show(j) }).catch(() => { /* the last known number stays */ }) }
    const changed = (e: Event) => { const d = Number((e as CustomEvent<{ delta?: number }>).detail?.delta) || 0; if (d) setCount((c) => countAfter(c, d)); read(true) }
    const seen = () => { if (document.visibilityState === "visible") read() }
    read()
    window.addEventListener(EVENT, changed)
    window.addEventListener("focus", seen)
    document.addEventListener("visibilitychange", seen)
    const every = window.setInterval(seen, 30_000)
    return () => { alive = false; stop(); window.removeEventListener(EVENT, changed); window.removeEventListener("focus", seen); document.removeEventListener("visibilitychange", seen); window.clearInterval(every) }
  }, [key])
  return count
}

/** The inbox for a page that lists it: the same shape as useJson("/api/inbox"), from the shared read. */
export function useInbox() {
  const [data, setData] = useState<Body | null>(last?.body ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback((force: boolean) => {
    setLoading(true)
    return readInbox(force)
      .then((j) => { if (j) { setData(j); setError(null) } })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    const stop = listen((j) => setData(j))
    const changed = () => { void load(true) }
    window.addEventListener(EVENT, changed)
    void load(false)
    return () => { stop(); window.removeEventListener(EVENT, changed) }
  }, [load])
  const reload = useCallback(() => { void load(true) }, [load])
  return { data, loading, error, reload }
}
