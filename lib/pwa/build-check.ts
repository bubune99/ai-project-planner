/**
 * Is the page running an older build than the one that is live? (card 1ff9465d)
 *
 * After a ship, an open tab, and above all the installed app (which has no reload button), kept running the scripts it
 * loaded first: moving around inside the app never fetches new ones. The page knows the build it was loaded from; it
 * asks /api/version which build is live, and when they differ it says so and makes the next link a full load.
 * Pure: no React, no fetch, so it has a check file (build-check.assert.ts).
 */

/** How often a visible page asks, at most. Focus and coming back to the tab also ask, within this limit. */
export const CHECK_EVERY_MS = 5 * 60 * 1000
/** Never ask more often than this, however often focus comes and goes. */
export const MIN_GAP_MS = 30 * 1000

/** Unknown on either side (a local run, a failed read) is never "stale": a wrong reload prompt is worse than none. */
export function isStale(loaded: string | null | undefined, live: string | null | undefined): boolean {
  const a = (loaded || "").trim(), b = (live || "").trim()
  if (!a || !b || a === "dev" || b === "dev") return false
  return a !== b
}

/** Whether to ask now: on a timer tick only after CHECK_EVERY_MS, on focus or return after MIN_GAP_MS. */
export function shouldAsk(lastAskedAt: number | null, now: number, reason: "timer" | "focus"): boolean {
  if (lastAskedAt == null) return true
  const gap = now - lastAskedAt
  return reason === "timer" ? gap >= CHECK_EVERY_MS : gap >= MIN_GAP_MS
}

/**
 * Whether a click on this link should become a full load once the page is stale: same site, a plain left click
 * with no keys held, not a new tab, not a download, not a link to a part of this same page.
 */
export function fullLoadFor(link: { href: string; target?: string | null; download?: boolean }, here: string, click: { button: number; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }): boolean {
  if (click.button !== 0 || click.meta || click.ctrl || click.shift || click.alt) return false
  if (link.download || (link.target && link.target !== "_self")) return false
  let to: URL, from: URL
  try { to = new URL(link.href, here); from = new URL(here) } catch { return false }
  if (to.origin !== from.origin) return false
  if (to.pathname === from.pathname && to.search === from.search && to.hash) return false
  return true
}
