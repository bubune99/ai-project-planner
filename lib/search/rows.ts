/**
 * The rows the top search shows for what was typed: pages first, then what /api/search found, then one row that asks
 * the assistant. Walk 2026-11-16: finding a card took the board's own search plus the assistant, and the box only
 * jumped to pages. The ask row sits right after the pages so it is always in view. Pure; checked in rows.assert.ts.
 */
export type Row =
  | { key: string; group: string; title: string; sub: string; href: string }
  | { key: string; group: string; title: string; sub: string; ask: string }

type Found = { id: string; title?: string | null; projectId?: string | null; projectName?: string | null; status?: string | null; category?: string | null; url?: string | null }
export type Results = Partial<Record<"projects" | "tasks" | "documents" | "ideas" | "decisions", Found[]>>

const GROUP: [keyof Results, string][] = [["projects", "Projects"], ["tasks", "Tasks"], ["documents", "Documents"], ["ideas", "Ideas"], ["decisions", "Decisions"]]

function hrefOf(kind: keyof Results, f: Found): string | null {
  if (f.url) return f.url
  if (kind === "projects") return `/project/${f.id}`
  if (kind === "ideas") return `/ideas/${f.id}`
  if (kind === "decisions") return f.projectId ? `/project/${f.projectId}?tab=decisions` : null
  return null
}

export function searchRows(typed: string, pages: [string, { title: string; sub: string }][], results: Results | null, perGroup = 5): Row[] {
  const q = typed.trim()
  const rows: Row[] = pages.slice(0, 5).map(([href, m]) => ({ key: `page:${href}`, group: "Pages", title: m.title, sub: m.sub, href }))
  if (q) rows.push({ key: "ask", group: "Assistant", title: `Ask the assistant: “${q}”`, sub: "Finds it or does it for you", ask: q })
  if (results) {
    for (const [kind, group] of GROUP) {
      for (const f of (results[kind] ?? []).slice(0, perGroup)) {
        const href = hrefOf(kind, f)
        if (!href || !f.title) continue
        rows.push({ key: `${kind}:${f.id}`, group, title: f.title, sub: [f.projectName, f.category].filter(Boolean).join(" · "), href })
      }
    }
  }
  return rows
}
