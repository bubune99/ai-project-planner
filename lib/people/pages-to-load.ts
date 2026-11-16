/**
 * Which scanned pages People and flows loads: every page a step links to (so its steps can
 * show verified), the page being looked at, then others up to BROWSE_PAGES for the page
 * picker. Pure; checked by pages-to-load.assert.ts.
 */

export const BROWSE_PAGES = 8

interface PageRef { id: string; route: string }
interface DocLike { flows: ReadonlyArray<{ steps: ReadonlyArray<{ ref?: { route: string } | null }> }> }

export function pagesToLoad(pages: ReadonlyArray<PageRef> | undefined, doc: DocLike | undefined, current: string | null): string[] {
  if (!pages?.length) return []
  const byRoute = new Map(pages.map((p) => [p.route, p.id]))
  const out: string[] = []
  const add = (id: string | undefined) => { if (id && !out.includes(id)) out.push(id) }
  for (const f of doc?.flows ?? []) for (const s of f.steps) if (s.ref) add(byRoute.get(s.ref.route))
  if (current) add(byRoute.get(current))
  const linked = out.length
  for (const p of pages) { if (out.length - linked >= BROWSE_PAGES) break; if (!out.includes(p.id)) add(p.id) }
  return out
}
