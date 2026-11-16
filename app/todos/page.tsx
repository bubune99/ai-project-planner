"use client"

/*
 * /todos — "My Work".
 *
 * Was a flat list of 364 todos, 358 of which were copies of tasks that already
 * lived on project boards (migration 057 mirrored them into project_steps and
 * nothing kept the pair in sync). It now reads GET /api/work, which returns each
 * project step once plus only the todos that are NOT mirrors — personal work,
 * and project todos created since the migration. See lib/work-items.ts.
 *
 * The layout follows the datatable pattern: one toolbar, one table, grouped by
 * project. The old page had two tab bars for the same four views and rendered
 * every row at 108px; the "Today" and "Upcoming" views were permanently empty
 * because only 23 of 364 items carried a due date.
 */

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"

import { TodoQuickAdd } from "@/components/todos/TodoQuickAdd"
import { TodoEditModal } from "@/components/todos/TodoEditModal"
import { WorkList, WorkCalendar } from "@/components/work/opx-work"
import { Seg } from "@/components/project/opx/shared"
import { KanbanView, ALL_PROJECTS } from "@/components/views/KanbanView"
import { useRoomBelow } from "@/lib/layout/use-room-below"
import type { Todo, TodoPriority } from "@/lib/types"

interface Project {
  id: string
  name: string
}

/** The board fills what the page area shows, so one scrollbar moves the page (as on a project's board). */
function BoardRoom({ children }: { children: React.ReactNode }) {
  const { ref, height } = useRoomBelow<HTMLDivElement>()
  return <div ref={ref} data-testid="board-room" style={{ height: height ?? "calc(100vh - 260px)" }}>{children}</div>
}

export default function TodosPage() {
  const router = useRouter()
  const user = useUser()

  const [projects, setProjects] = useState<Project[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // Same pair as a project's task views: List · Calendar. Kept in the URL so a link or refresh keeps it.
  // Board: every project's cards in the same columns (owner, 2026-11-16: "Macro task board to micro task board").
  const [view, setView] = useState<"list" | "board" | "calendar">("list")
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("view"); if (v === "calendar" || v === "board") setView(v) }, [])
  const pickView = (v: "list" | "board" | "calendar") => {
    setView(v)
    const u = new URL(window.location.href); u.searchParams.set("view", v); window.history.replaceState(null, "", u)
  }

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects")
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data.map((p: any) => ({ id: p.id, name: p.name })))
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      router.push("/")
      return
    }
    fetchProjects()
  }, [user, router, fetchProjects])

  /*
    Adding WITH a project creates a step on that project, so it appears on the
    board immediately. Adding a project todo is exactly how the duplication
    started: it lands in the todo list and never reaches the board. Adding
    WITHOUT a project stays a personal todo.
  */
  const handleAdd = async (item: {
    title: string
    priority?: TodoPriority
    dueDate?: string
    projectId?: string
  }) => {
    setIsAdding(true)
    try {
      const res = item.projectId
        ? await fetch(`/api/projects/${item.projectId}/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.title,
              priority: item.priority ?? "medium",
              ...(item.dueDate ? { end_date: item.dueDate } : {}),
            }),
          })
        : await fetch("/api/todos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`)
      }
      const project = projects.find((p) => p.id === item.projectId)
      toast.success(project ? `Added to ${project.name}` : "Added")
      setRefreshKey((k) => k + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add")
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditTodo = async (todoId: string) => {
    try {
      const res = await fetch(`/api/todos/${todoId}`)
      const body = await res.json()
      if (!res.ok || !body.success) throw new Error(body?.error?.message || `HTTP ${res.status}`)
      setEditingTodo(body.data)
      setIsEditModalOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open todo")
    }
  }

  const handleSaveTodo = async (updates: Partial<Todo>) => {
    if (!editingTodo) return
    const res = await fetch(`/api/todos/${editingTodo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error?.message || `HTTP ${res.status}`) }
    setRefreshKey((k) => k + 1)
  }

  /** A delete can be taken back: the line says what went and offers Undo. */
  const handleDeleteTodo = async () => {
    if (!editingTodo) return
    const gone = editingTodo
    const res = await fetch(`/api/todos/${gone.id}`, { method: "DELETE" })
    if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error?.message || `HTTP ${res.status}`) }
    setRefreshKey((k) => k + 1)
    toast(`Deleted "${gone.title}"`, { duration: 10000, action: { label: "Undo", onClick: async () => {
      const back = await fetch(`/api/todos/${gone.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }) })
      if (!back.ok) { toast.error("Couldn't bring it back"); return }
      setRefreshKey((k) => k + 1)
    } } })
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="opx-page">
        <header className="opx-pbar">
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1>My work</h1>
            <div className="opx-muted">Every project&apos;s tasks and your own todos, each shown once.</div>
          </div>
          <Seg label="View" value={view} onChange={pickView} options={[["list", "List"], ["board", "Board"], ["calendar", "Calendar"]]} />
        </header>
        {view !== "board" && (
          <section className="opx-sec">
            <TodoQuickAdd onAdd={handleAdd} projects={projects} isLoading={isAdding} />
          </section>
        )}
        {view === "list" && <WorkList refreshKey={refreshKey} onEditTodo={handleEditTodo} />}
        {view === "calendar" && <WorkCalendar refreshKey={refreshKey} />}
        {view === "board" && (
          <BoardRoom>
            <KanbanView projectId={ALL_PROJECTS} onTaskSelect={() => {}} />
          </BoardRoom>
        )}
      </div>

      <TodoEditModal
        todo={editingTodo}
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingTodo(null)
        }}
        onSave={handleSaveTodo}
        onDelete={handleDeleteTodo}
        projects={projects}
      />
    </DashboardLayout>
  )
}
