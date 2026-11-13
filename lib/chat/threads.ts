/**
 * Several conversations open at once, as tabs above the chat (the same shape
 * as BYB's admin assistant). Each thread is its own conversation on the
 * server. Pure rules: what a tab shows, how many fit, what closing does.
 * Checked by threads.assert.ts.
 */

export type ThreadStatus = "idle" | "thinking" | "done" | "error"

export interface Thread {
  id: string
  title: string
  status: ThreadStatus
  /** Started here and nothing sent yet: there is nothing to load from the server. */
  fresh?: boolean
}

export const MAX_THREADS = 4
export const NEW_TITLE = "New chat"

export const STATUS_WORDS: Record<ThreadStatus, string> = { idle: "New", thinking: "Working", done: "Done", error: "Stopped with an error" }

/** A thread's status from the chat hook's state. */
export function deriveStatus(chatStatus: "submitted" | "streaming" | "ready" | "error", messageCount: number): ThreadStatus {
  if (chatStatus === "submitted" || chatStatus === "streaming") return "thinking"
  if (chatStatus === "error") return "error"
  return messageCount > 0 ? "done" : "idle"
}

/** A tab title from the first thing asked. */
export function titleFrom(text: string, max = 28): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (!t) return NEW_TITLE
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export const newThread = (id: string): Thread => ({ id, title: NEW_TITLE, status: "idle", fresh: true })

export type AddResult = { ok: true; threads: Thread[] } | { ok: false; error: string }

/** Open a thread as a new tab. One already open is left as it is. */
export function addThread(threads: readonly Thread[], thread: Thread): AddResult {
  if (threads.some((t) => t.id === thread.id)) return { ok: true, threads: [...threads] }
  if (threads.length >= MAX_THREADS) return { ok: false, error: `Up to ${MAX_THREADS} chats open at once. Close one first.` }
  return { ok: true, threads: [...threads, thread] }
}

/**
 * Open a saved conversation from history: in its own tab, or, when the tab
 * you are on is an unused new chat, in place of it.
 */
export function openSaved(threads: readonly Thread[], activeId: string | null, id: string, title: string): AddResult {
  if (threads.some((t) => t.id === id)) return { ok: true, threads: [...threads] }
  const saved: Thread = { id, title: title || "Conversation", status: "done" }
  const active = threads.find((t) => t.id === activeId)
  if (active?.fresh && active.status === "idle") return { ok: true, threads: threads.map((t) => (t.id === active.id ? saved : t)) }
  return addThread(threads, saved)
}

/**
 * What closing a tab does:
 *   confirm  it is still working: ask "Stop and close?" first
 *   reset    it is the only tab: it becomes a new chat (the strip never goes empty)
 *   close    close it
 */
export type CloseDecision = "confirm" | "reset" | "close"
export function closeDecision(o: { status: ThreadStatus; count: number; confirmed?: boolean }): CloseDecision {
  if (o.status === "thinking" && !o.confirmed) return "confirm"
  return o.count <= 1 ? "reset" : "close"
}

/** Close a tab; the tab to its left (or the new first one) becomes active when the active one closes. */
export function closeThread(threads: readonly Thread[], id: string, activeId: string | null): { threads: Thread[]; activeId: string | null } {
  const i = threads.findIndex((t) => t.id === id)
  if (i < 0) return { threads: [...threads], activeId }
  const next = threads.filter((t) => t.id !== id)
  if (activeId !== id) return { threads: next, activeId }
  return { threads: next, activeId: next[Math.max(0, i - 1)]?.id ?? null }
}

/** Sizes of the strip, in px. */
export const STRIP = { tabMax: 168, tabMinActive: 120, tabMinInactive: 96, plus: 32, overflowControls: 24 + 24 + 34 + 8 } as const

export interface TabWindow { start: number; end: number; hidden: number; overflow: boolean; canPrev: boolean; canNext: boolean }

/**
 * Which tabs to draw in `width` px. Tabs shrink to their minimums first; when
 * they still don't fit, a window of them shows with ‹ › and "+N". A width of
 * 0 means "not measured yet" and draws them all, so nothing flashes.
 */
export function tabWindow(o: { width: number; count: number; start?: number }): TabWindow {
  const all: TabWindow = { start: 0, end: Math.max(0, o.count), hidden: 0, overflow: false, canPrev: false, canNext: false }
  if (o.count <= 0 || o.width <= 0) return all
  const need = STRIP.tabMinActive + (o.count - 1) * STRIP.tabMinInactive + STRIP.plus
  if (need <= o.width) return all
  const room = o.width - STRIP.plus - STRIP.overflowControls
  const fit = room < STRIP.tabMinActive ? 1 : 1 + Math.floor((room - STRIP.tabMinActive) / STRIP.tabMinInactive)
  const k = Math.min(o.count, fit)
  if (k >= o.count) return all
  const s = Math.max(0, Math.min(Math.floor(o.start ?? 0), o.count - k))
  return { start: s, end: s + k, hidden: o.count - k, overflow: true, canPrev: s > 0, canNext: s + k < o.count }
}

/** The window start that shows tab `index`, moving as little as possible. */
export function revealStart(win: Pick<TabWindow, "start" | "end">, index: number): number {
  const size = win.end - win.start
  if (size <= 0 || index < 0) return win.start
  if (index < win.start) return index
  if (index >= win.end) return index - size + 1
  return win.start
}

/** What is kept between page loads: which tabs are open and which is showing. Statuses start over. */
export interface SavedTabs { threads: { id: string; title: string; fresh?: boolean }[]; activeId: string | null }

export function toSaved(threads: readonly Thread[], activeId: string | null): SavedTabs {
  return { threads: threads.map(({ id, title, fresh }) => ({ id, title, ...(fresh ? { fresh } : {}) })), activeId }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Read saved tabs; anything malformed is dropped rather than trusted. */
export function fromSaved(raw: unknown): { threads: Thread[]; activeId: string | null } {
  const list = raw && typeof raw === "object" && Array.isArray((raw as SavedTabs).threads) ? (raw as SavedTabs).threads : []
  const threads: Thread[] = []
  for (const t of list) {
    if (!t || typeof t.id !== "string" || !UUID.test(t.id) || threads.some((x) => x.id === t.id) || threads.length >= MAX_THREADS) continue
    const fresh = t.fresh === true
    threads.push({ id: t.id, title: typeof t.title === "string" && t.title ? t.title.slice(0, 80) : NEW_TITLE, status: fresh ? "idle" : "done", ...(fresh ? { fresh } : {}) })
  }
  const wanted = (raw as SavedTabs | null)?.activeId
  return { threads, activeId: threads.some((t) => t.id === wanted) ? (wanted as string) : threads[0]?.id ?? null }
}
