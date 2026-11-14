/**
 * Is a stored picture of a page still what is live?
 *
 * A picture is cut from a scan. A scan is only true for the build it saw. Each time a change ships, the agent that
 * shipped it reports which pages it touched (a "ship"). A picture taken before a ship that touched its page is
 * behind, and says so, instead of passing as current.
 *
 * Pure: no database, no clock (pass `now`). Checked in fresh-model.assert.ts.
 */

export interface Ship {
  /** The commit that went live. */
  sha: string
  /** Where it went live: "production" or "staging". */
  env: string
  /** The pages it touched, as routes ("/todos", "/project/[id]"). */
  routes: string[]
  /** True when it touched something every page shares (a layout, a stylesheet, a shared component). */
  everywhere: boolean
  /** When it went live (ISO). */
  at: string
}

export type FreshState = "current" | "behind" | "unknown"
export interface Freshness {
  state: FreshState
  /** How many ships touched the page since the picture. */
  behindBy: number
  /** The first ship the picture missed (ISO), when behind. */
  since: string | null
  /** One plain line for under the picture. */
  line: string
}

const SHARED = [/^app\/globals\.css$/, /^app\/[^/]+\.css$/, /^app\/layout\.tsx?$/, /^components\/(ui|layout|jarvis\/shell|pwa)\//, /^middleware\.ts$/, /^tailwind\.config\./, /^public\/sw\.js$/]
const PAGE_FILE = /^(?:src\/)?app\/(.*?)\/?(?:page|layout|loading|error|template)\.(?:tsx|jsx|ts|js)$/

/** The route a Next app-router file serves, or null when the file is not a page file. Groups like (app) do not appear in a route. */
export function routeOfFile(file: string): string | null {
  const f = file.replace(/\\/g, "/").replace(/^\.\//, "")
  const m = PAGE_FILE.exec(f)
  if (!m) return null
  const parts = m[1].split("/").filter((p) => p && !/^\(.*\)$/.test(p) && !p.startsWith("@"))
  if (parts[0] === "api") return null
  return "/" + parts.join("/")
}

/** What a set of changed files touches: the pages by route, and whether something shared by every page changed. */
export function shipTouches(files: string[]): { routes: string[]; everywhere: boolean } {
  const routes = new Set<string>()
  let everywhere = false
  for (const raw of files) {
    const f = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^src\//, "")
    if (!f || /^(docs|scripts|tests?|\.github)\//.test(f) || /\.(md|assert\.ts|test\.tsx?|sql)$/.test(f) || /^app\/api\//.test(f)) continue
    const route = routeOfFile(f)
    if (route) { routes.add(route); if (/layout\.(tsx|jsx|ts|js)$/.test(f) && route === "/") everywhere = true; continue }
    if (SHARED.some((re) => re.test(f))) { everywhere = true; continue }
    // Any other component, style or library file may be drawn by pages we cannot name from here.
    if (/^(components|lib|app|public|styles)\//.test(f) && /\.(tsx|jsx|ts|js|css|svg|png|json)$/.test(f)) everywhere = true
  }
  return { routes: [...routes].sort(), everywhere }
}

/** Does a ship's route cover a scanned page's route? "/project/[id]" covers "/project/abc"; a layout route covers what is under it only when listed. */
export function routeCovers(shipRoute: string, pageRoute: string): boolean {
  const a = shipRoute.split("?")[0].replace(/\/+$/, "") || "/", b = pageRoute.split("?")[0].replace(/\/+$/, "") || "/"
  if (a === b) return true
  const as = a.split("/"), bs = b.split("/")
  if (as.length !== bs.length) return false
  return as.every((seg, i) => seg === bs[i] || /^\[.*\]$/.test(seg))
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

/**
 * Where a picture stands. `env` is where the picture was taken (a staging picture is judged against staging ships and
 * production ships both: production only ever gets what staging had).
 */
export function freshness(a: { capturedAt: string | null; route: string; ships: Ship[]; projectReports: boolean }): Freshness {
  if (!a.capturedAt) return { state: "unknown", behindBy: 0, since: null, line: "No picture of this page is stored." }
  const taken = new Date(a.capturedAt).getTime()
  const missed = a.ships
    .filter((s) => new Date(s.at).getTime() > taken && (s.everywhere || s.routes.some((r) => routeCovers(r, a.route))))
    .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())
  if (missed.length) {
    const n = missed.length
    return { state: "behind", behindBy: n, since: missed[0].at, line: `Out of date: taken ${day(a.capturedAt)}, and ${n} ${n === 1 ? "change has" : "changes have"} shipped to this page since (${day(missed[0].at)}${n > 1 ? ` to ${day(missed[n - 1].at)}` : ""}).` }
  }
  if (!a.projectReports) return { state: "unknown", behindBy: 0, since: null, line: `Taken ${day(a.capturedAt)}. No shipped changes have been reported for this project yet, so this cannot be confirmed current.` }
  return { state: "current", behindBy: 0, since: null, line: `Current: taken ${day(a.capturedAt)}, and nothing has shipped to this page since.` }
}

/** For a project: how many of its scanned pages have pictures that are behind. */
export function staleCount(pages: Freshness[]): { behind: number; unknown: number; total: number; line: string } {
  const behind = pages.filter((p) => p.state === "behind").length, unknown = pages.filter((p) => p.state === "unknown").length, total = pages.length
  const line = !total ? "" : behind ? `${behind} of ${total} ${total === 1 ? "page has" : "pages have"} pictures older than what is live. An agent rescans them; nothing here needs you.` : unknown ? `${unknown} of ${total} ${total === 1 ? "page" : "pages"} cannot be confirmed current yet.` : `All ${total} ${total === 1 ? "page is" : "pages are"} pictured as live.`
  return { behind, unknown, total, line }
}

export class ShipError extends Error {}

/** Cleans what an agent reports after shipping. Throws a ShipError naming what is wrong. */
export function parseShip(raw: unknown): { sha: string; env: string; routes: string[]; everywhere: boolean; files: number; note: string | null; at: string | null } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const sha = typeof b.sha === "string" ? b.sha.trim() : ""
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new ShipError("sha must be the commit that shipped (7 to 40 hex characters)")
  const env = b.env === "staging" ? "staging" : b.env === "production" ? "production" : ""
  if (!env) throw new ShipError('env must be "production" or "staging"')
  const files = Array.isArray(b.files) ? b.files.filter((f): f is string => typeof f === "string").slice(0, 2000) : null
  const given = Array.isArray(b.routes) ? b.routes.filter((r): r is string => typeof r === "string" && r.startsWith("/") && r.length <= 200).slice(0, 200) : []
  const derived = files ? shipTouches(files) : { routes: [], everywhere: false }
  const routes = [...new Set([...given, ...derived.routes])].sort()
  const everywhere = b.everywhere === true || derived.everywhere
  if (!routes.length && !everywhere && !files) throw new ShipError("Say what shipped: files (the changed files), or routes, or everywhere: true")
  const at = typeof b.at === "string" && !Number.isNaN(new Date(b.at).getTime()) ? new Date(b.at).toISOString() : null
  return { sha: sha.toLowerCase(), env, routes, everywhere, files: files?.length ?? 0, note: typeof b.note === "string" ? b.note.slice(0, 500) : null, at }
}
