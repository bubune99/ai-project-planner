/**
 * Swipe the page down to refresh, on a phone.
 *
 * Owner, 2026-11-15: "In my mobile version, I would like to be able to swipe the page down to refresh. That would be
 * great and right now I can't do that." The planner is installed as an app, which has no browser bar and, on an
 * iPhone, no pull to refresh of its own, so the shell provides it.
 *
 * These are the rules, with nothing of the browser in them. Checked in pull-refresh.assert.ts.
 */

/** Where a touch began, read once from the page when the finger lands. */
export interface PullStart {
  /** The page is scrolled to its very top. */
  atTop: boolean
  /** The finger landed inside a panel that scrolls on its own (a list, a board column, a code box). */
  inScrollPanel: boolean
  /** A dialog, sheet or menu is open. */
  overlayOpen: boolean
  /** The finger landed on something that is dragged (a card, a map, a slider) or drawn on. */
  onDraggable: boolean
  /** The finger landed in a text field, or one has the keyboard. */
  inField: boolean
  /** A refresh is already running. */
  busy: boolean
}

/** May a pull begin from this touch at all? */
export function mayPull(s: PullStart): boolean {
  return s.atTop && !s.inScrollPanel && !s.overlayOpen && !s.onDraggable && !s.inField && !s.busy
}

/** Distance the finger must travel down before a release refreshes. */
export const PULL_THRESHOLD = 72
/** The indicator never travels further than this. */
export const PULL_MAX = 112

/**
 * Is this movement a pull down, and not a sideways swipe or a tap? Decided once, on the first clear movement:
 * "pull" takes the gesture, "leave" hands it back to the page for good, "wait" means too small to tell.
 */
export function pullIntent(dx: number, dy: number): "pull" | "leave" | "wait" {
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return "wait"
  return dy > 0 && dy > Math.abs(dx) * 1.5 ? "pull" : "leave"
}

/** How far the indicator has come down for a finger that has moved `dy`: it follows, then resists. */
export function pullOffset(dy: number): number {
  if (!(dy > 0)) return 0
  const eased = dy <= PULL_THRESHOLD ? dy : PULL_THRESHOLD + (dy - PULL_THRESHOLD) * 0.4
  return Math.min(PULL_MAX, Math.round(eased))
}

/** Would letting go now refresh? */
export function pullArmed(dy: number): boolean {
  return pullOffset(dy) >= PULL_THRESHOLD
}

/**
 * What a release does. Typing that has not been saved is never thrown away by one swipe: the first armed release
 * says so, and only a second one soon after refreshes.
 */
export function onRelease(a: { dy: number; unsavedTyping: boolean; warnedAt: number | null; now: number }): "nothing" | "warn" | "refresh" {
  if (!pullArmed(a.dy)) return "nothing"
  if (!a.unsavedTyping) return "refresh"
  return a.warnedAt !== null && a.now - a.warnedAt <= 8000 ? "refresh" : "warn"
}
