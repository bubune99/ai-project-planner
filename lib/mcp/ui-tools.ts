/**
 * Screen tools, both read-only (they change no data; the browser draws a ring,
 * a walkthrough step, or opens a page):
 *   show_unit — point at a part of the screen.
 *   go_to     — open a planner page or a project's tab.
 * Resolving logic is lib/ade/ui/control.ts + planner-units.ts, asserted in ui-tools.assert.ts.
 */
import { z } from "zod"
import { resolveUnit, notFound } from "@/lib/ade/ui/control"
import { PLANNER_UNITS, PLANNER_UNIT_LABELS } from "@/lib/ade/ui/planner-units"

export function showUnit(input: { unit: string; mode?: "highlight" | "spotlight"; caption?: string }) {
  const mode = input.mode ?? ("highlight" as const)
  const caption = (input.caption ?? "").slice(0, 140)
  if (!input.unit.trim()) return notFound(input.unit, null)
  const hit = resolveUnit(input.unit, PLANNER_UNITS)
  // A known part: pointed by its stable key. Anything else: the browser looks for it on the person's screen
  // (the dock tells the model which controls are visible) and says so plainly if it is not there.
  if (hit) {
    return { ok: true as const, shown: hit.label, key: hit.key, mode, caption, sentence: `Pointing at “${hit.label}”. If it is not on the person's screen right now, they will be told so.` }
  }
  const ask = input.unit.trim().slice(0, 60)
  return { ok: true as const, shown: ask, ask, mode, caption, sentence: `Looking for “${ask}” on the person's screen. If it is not there, they will be told so.` }
}

export const PAGES: ReadonlyArray<{ key: string; label: string; path: string; aliases: string[] }> = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard", aliases: ["home", "overview"] },
  { key: "projects", label: "Projects", path: "/projects", aliases: ["all projects", "project list"] },
  { key: "clients", label: "Clients", path: "/clients", aliases: ["client work", "retainers"] },
  { key: "today", label: "Today", path: "/todos", aliases: ["todos", "to do", "tasks today", "my todos"] },
  { key: "inbox", label: "Inbox", path: "/inbox", aliases: ["questions", "approvals", "waiting on me"] },
  { key: "ideas", label: "Ideas", path: "/ideas", aliases: ["idea incubator"] },
  { key: "finance", label: "Finance", path: "/finance", aliases: ["money", "net worth"] },
  { key: "memory", label: "Memory", path: "/memory", aliases: ["knowledge base", "notes"] },
  { key: "agents", label: "Agents", path: "/agents", aliases: ["agent jobs", "workers"] },
  { key: "calendar", label: "Calendar", path: "/calendar", aliases: ["schedule", "events"] },
  { key: "chat", label: "AI Chat", path: "/chat", aliases: ["full chat", "chat history", "conversations"] },
  { key: "sops", label: "SOPs", path: "/sops", aliases: ["procedures", "standard operating procedures"] },
  { key: "library", label: "Library", path: "/library", aliases: ["templates", "skills"] },
  { key: "catalog", label: "Catalog", path: "/catalog", aliases: [] },
  { key: "settings", label: "Settings", path: "/settings", aliases: ["preferences", "configuration"] },
]

export const PROJECT_TABS = ["overview", "tasks", "docs", "decisions", "ideas", "finance", "metrics", "settings"] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function goTo(input: { where: string; projectId?: string; tab?: string }) {
  const where = input.where.trim().toLowerCase()
  const tab = (input.tab ?? "").trim().toLowerCase()
  const tabFrom = PROJECT_TABS.find((t) => t === tab) ?? PROJECT_TABS.find((t) => where === t || where.endsWith(` ${t}`) || where.includes(`${t} tab`))
  if (input.projectId && UUID.test(input.projectId) && (tabFrom || /project/.test(where))) {
    const t = tabFrom ?? "overview"
    return { ok: true as const, path: `/project/${input.projectId}?tab=${t}`, label: `Project · ${t[0].toUpperCase()}${t.slice(1)}` }
  }
  const page = resolveUnit(
    where,
    PAGES.map((p) => ({ key: p.key, label: p.label, selector: p.path, aliases: p.aliases })),
  )
  if (page) return { ok: true as const, path: page.selector, label: page.label }
  return { ok: false as const, error: `I can't find a page called “${input.where.slice(0, 40)}”. Pages: ${PAGES.map((p) => p.label).join(", ")}. For a project tab, give the projectId and one of: ${PROJECT_TABS.join(", ")}.` }
}

export function registerUiTools(server: any): void {
  server.tool(
    "show_unit",
    `Point at a part of the app on the person's screen. Read-only: it changes nothing. The context lists the controls visible right now; use their labels. Known fixed parts: ${PLANNER_UNIT_LABELS}. Use mode "highlight" when you are working on or reviewing something; use "spotlight" ONLY to teach someone how to use the app (it dims the rest of the page and waits for them). Do not claim they saw it: say you pointed at it.`,
    {
      unit: z.string().describe("What to point at, in the label the screen shows, e.g. 'Tasks' or 'Add task' or 'history'"),
      mode: z.enum(["highlight", "spotlight"]).optional(),
      caption: z.string().optional().describe("One short line shown on the pointer, e.g. 'Tap here to start a new chat'"),
    },
    async (input: { unit: string; mode?: "highlight" | "spotlight"; caption?: string }) => {
      const out = showUnit(input)
      return { content: [{ type: "text" as const, text: JSON.stringify(out) }] }
    },
  )
  server.tool(
    "go_to",
    `Open a planner page or a project's tab for the person (the browser navigates). Read-only: it changes no data. Pages: ${PAGES.map((p) => p.label).join(", ")}. For a project tab pass projectId and tab (${PROJECT_TABS.join(", ")}). Say you opened it; do not claim to have read what is on it.`,
    {
      where: z.string().describe("Page name, e.g. 'todos', 'inbox', or 'tasks' with a projectId"),
      projectId: z.string().optional().describe("Project UUID, for a project tab"),
      tab: z.enum(PROJECT_TABS).optional(),
    },
    async (input: { where: string; projectId?: string; tab?: string }) => {
      const out = goTo(input)
      return { content: [{ type: "text" as const, text: JSON.stringify(out) }] }
    },
  )
}
