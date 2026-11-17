/**
 * One line per server error, for Vercel's logs (owner, 2026-11-17: "Vercel for now. Sooner or later I need
 * GlitchTip"). Next calls onRequestError for every uncaught error in a route, page or server action; this turns
 * it into a single searchable line with the route and the kind of request, and never the request body, headers,
 * query values or cookies. When GlitchTip arrives it can take the same fields.
 * Pure (check file: request-error.assert.ts).
 */
export interface RequestInfo { path: string; method: string }
export interface RouteContext { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string }

/** The path without its query (ids in a path stay; query values may carry tokens). */
export function cleanPath(path: string): string {
  const p = String(path || "").split("?")[0].split("#")[0]
  return p.slice(0, 300) || "/"
}

export function errorLine(err: unknown, request: RequestInfo, context: RouteContext): string {
  const e = err as { name?: string; message?: string; digest?: string }
  const message = String(e?.message || err || "unknown error").replace(/\s+/g, " ").slice(0, 300)
  return JSON.stringify({
    level: "error",
    kind: "request-error",
    route: context?.routePath || null,
    type: context?.routeType || null,
    method: request?.method || null,
    path: cleanPath(request?.path || ""),
    name: e?.name || "Error",
    message,
    digest: e?.digest || null,
  })
}
