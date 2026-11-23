/** The count shown the moment after a press, before the server has answered: never below nothing. Pure. */
export function countAfter(count: number, delta: number): number {
  const n = Math.round((Number(count) || 0) + (Number(delta) || 0))
  return n < 0 ? 0 : n
}

/** How long one read of the inbox serves every part of the page that asks for it (the sidebar, the top bar, the page). */
export const SHARED_READ_MS = 1500

/**
 * Whether a new reader can use the last read instead of asking the server again. Every page asked /api/inbox two to
 * four times on load, each about a second (measured on staging 2026-11-23). Pure: `now` is passed in.
 */
export function reuseRead(last: { at: number } | null, now: number, force: boolean): boolean {
  return !force && !!last && now - last.at >= 0 && now - last.at < SHARED_READ_MS
}
