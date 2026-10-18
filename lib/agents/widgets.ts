/*
 * Widgets: a compact, tappable card built from a tool result, shown under the
 * agent's text (phone first). Pure: takes the tool name and the result text the
 * tool returned and gives back a small capped structure, or null. The text
 * answer stays as the fallback; a widget never carries more than the card shows.
 *
 * Text that other people wrote arrives in untrusted_* fields; it is only ever
 * rendered as plain React text, never as markup or instructions.
 */

export interface TodoItem { id: string; title: string; due?: string | null; overdue?: boolean; project?: string | null; priority?: string | null }
export interface StepItem { id: string; projectId: string; title: string; project: string }
export interface CatchUpItem { projectId: string; name: string; summary: string; highlights: string[] }
export interface ProjectItem { id: string; name: string; status?: string | null }

export type Widget =
  | { kind: "todos"; title: string; items: TodoItem[]; more: number }
  | { kind: "steps"; title: string; items: StepItem[]; more: number }
  | { kind: "catchup"; title: string; items: CatchUpItem[]; quiet: number }
  | { kind: "projects"; title: string; items: ProjectItem[]; more: number }
  | { kind: "point"; key: string; label: string; mode: "highlight" | "spotlight"; caption: string }

const MAX = 6
const clip = (v: unknown, n = 90): string => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : [])
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

function parse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

export function toWidget(tool: string, text: string): Widget | null {
  if (!text || text.startsWith("Error:")) return null
  const data = parse(text)
  if (!isObj(data)) return null

  if (tool === "my_work") {
    const todos = arr(data.myTodos)
    const steps = arr(data.unassignedOpenSteps)
    if (todos.length) {
      const items = todos.slice(0, MAX).map((t) => ({
        id: String(t.id), title: clip(t.untrusted_title), due: str(t.due), overdue: t.overdue === true,
        project: t.untrusted_project ? clip(t.untrusted_project, 40) : null, priority: str(t.priority),
      }))
      return { kind: "todos", title: "Your open todos", items, more: Math.max(0, todos.length - items.length) }
    }
    if (steps.length) {
      const items = steps.slice(0, MAX).map((s) => ({
        id: String(s.id), projectId: String(s.projectId), title: clip(s.untrusted_title), project: clip(s.untrusted_project, 40),
      }))
      return { kind: "steps", title: "Open steps nobody owns", items, more: Math.max(0, steps.length - items.length) }
    }
    return null
  }

  if (tool === "list_todos") {
    const todos = arr(data.todos).filter((t) => t.status !== "completed")
    if (!todos.length) return null
    const items = todos.slice(0, MAX).map((t) => {
      const project = isObj(t.project) ? str(t.project.name) : str(t.project)
      return {
        id: String(t.id), title: clip(t.title), due: str(t.due_date) ?? str(t.due), overdue: false,
        project: project ? clip(project, 40) : null, priority: str(t.priority),
      }
    })
    return { kind: "todos", title: "Todos", items, more: Math.max(0, todos.length - items.length) }
  }

  if (tool === "catch_me_up") {
    const projects = arr(data.projects)
    const items = projects.slice(0, MAX).map((p) => ({
      projectId: String(p.projectId),
      name: clip(p.untrusted_projectName, 50),
      summary: clip(p.summary, 140),
      highlights: arr(p.highlights).slice(0, 3).map((h) => clip(h.untrusted_title ? `${h.untrusted_title}` : h.detail, 80)).filter(Boolean),
    }))
    if (!items.length) return null
    return { kind: "catchup", title: "What changed", items, quiet: typeof data.quietProjects === "number" ? data.quietProjects : 0 }
  }

  if (tool === "show_unit") {
    if (data.ok !== true || typeof data.key !== "string") return null
    return {
      kind: "point", key: data.key, label: clip(data.shown, 40),
      mode: data.mode === "spotlight" ? "spotlight" : "highlight", caption: clip(data.caption, 140),
    }
  }

  if (tool === "list_projects") {
    const projects = arr(data.projects)
    if (!projects.length) return null
    const items = projects.slice(0, MAX).map((p) => ({ id: String(p.id), name: clip(p.name, 50), status: str(p.status) }))
    return { kind: "projects", title: "Projects", items, more: Math.max(0, projects.length - items.length) }
  }

  return null
}
