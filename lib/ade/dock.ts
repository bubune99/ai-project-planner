/** Where the assistant dock shows, and how wide it may be. Pure so it can be asserted. */
export const DOCK_MIN = 340
export const DOCK_DEFAULT_RATIO = 0.4
export const DOCK_MAX_RATIO = 0.7
export const DOCK_MIN_VIEWPORT = 1100
export const DOCK_STEP = 40

/** Routes where the dock never shows: the full-page chat, sign-in/auth, invites, OAuth, API. */
const NO_DOCK = ["/chat", "/sign-in", "/sign-up", "/handler", "/invite", "/oauth", "/mcp", "/api", "/feedback", "/auth"]

export function dockAllowed(pathname: string, viewportWidth: number): boolean {
  if (viewportWidth < DOCK_MIN_VIEWPORT) return false
  return !NO_DOCK.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export function clampDock(width: number, viewportWidth: number): number {
  const max = Math.max(DOCK_MIN, Math.round(viewportWidth * DOCK_MAX_RATIO))
  return Math.min(max, Math.max(DOCK_MIN, Math.round(width)))
}

export function defaultDock(viewportWidth: number): number {
  return clampDock(viewportWidth * DOCK_DEFAULT_RATIO, viewportWidth)
}

/** Keyboard on the split handle: arrows nudge, Home = narrowest, End = widest. */
export function dockKey(width: number, key: string, viewportWidth: number): number | null {
  if (key === "ArrowLeft") return clampDock(width - DOCK_STEP, viewportWidth)
  if (key === "ArrowRight") return clampDock(width + DOCK_STEP, viewportWidth)
  if (key === "Home") return clampDock(0, viewportWidth)
  if (key === "End") return clampDock(viewportWidth, viewportWidth)
  return null
}

/** The open project, if the page is one: /project/<uuid>. */
export function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/project\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)
  return m ? m[1] : null
}
