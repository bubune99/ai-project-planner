"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"

import { TodoList } from "@/components/todos/TodoList"
import { TodoQuickAdd } from "@/components/todos/TodoQuickAdd"
import { TodoFilters } from "@/components/todos/TodoFilters"
import { TodoEditModal } from "@/components/todos/TodoEditModal"
import type { Todo, TodoPriority } from "@/lib/types"

interface Project {
  id: string
  name: string
}

interface TodoCounts {
  today: number
  upcoming: number
  active: number
  completed: number
}

export default function TodosPage() {
  const router = useRouter()
  const user = useUser()

  // State
  const [todos, setTodos] = useState<Todo[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [counts, setCounts] = useState<TodoCounts>({ today: 0, upcoming: 0, active: 0, completed: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)

  // Filters
  const [view, setView] = useState<"today" | "upcoming" | "all" | "completed">("all")
  const [priorityFilter, setPriorityFilter] = useState("")
  const [projectFilter, setProjectFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Edit modal
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Fetch todos
  const fetchTodos = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("view", view)
      if (priorityFilter) params.set("priority", priorityFilter)
      if (projectFilter === "unlinked") {
        params.set("unlinked", "true")
      } else if (projectFilter) {
        params.set("projectId", projectFilter)
      }
      if (searchQuery) params.set("search", searchQuery)

      const response = await fetch(`/api/todos?${params}`)
      const data = await response.json()

      if (data.success) {
        setTodos(data.data)
        if (data.meta?.counts) {
          setCounts(data.meta.counts)
        }
      }
    } catch (error) {
      console.error("Failed to fetch todos:", error)
    } finally {
      setIsLoading(false)
    }
  }, [view, priorityFilter, projectFilter, searchQuery])

  // Fetch projects for linking
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

  // Initial load
  useEffect(() => {
    if (!user) {
      router.push("/")
      return
    }
    fetchProjects()
  }, [user, router, fetchProjects])

  // Fetch todos when filters change
  useEffect(() => {
    if (user) {
      fetchTodos()
    }
  }, [user, fetchTodos])

  // Add todo
  const handleAddTodo = async (newTodo: {
    title: string
    priority?: TodoPriority
    dueDate?: string
    projectId?: string
  }) => {
    setIsAdding(true)
    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTodo),
      })
      const data = await response.json()

      if (data.success) {
        // Refresh todos to get updated list and counts
        fetchTodos()
      }
    } catch (error) {
      console.error("Failed to add todo:", error)
    } finally {
      setIsAdding(false)
    }
  }

  // Toggle todo
  const handleToggleTodo = async (id: string) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? { ...todo, status: todo.status === "completed" ? "pending" : "completed" }
          : todo
      )
    )

    try {
      const response = await fetch(`/api/todos/${id}/toggle`, {
        method: "POST",
      })
      const data = await response.json()

      if (data.success) {
        // Refresh to get accurate counts
        fetchTodos()
      }
    } catch (error) {
      console.error("Failed to toggle todo:", error)
      // Revert on error
      fetchTodos()
    }
  }

  // Edit todo
  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo)
    setIsEditModalOpen(true)
  }

  // Save edited todo
  const handleSaveTodo = async (updates: Partial<Todo>) => {
    if (!editingTodo) return

    try {
      const response = await fetch(`/api/todos/${editingTodo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      const data = await response.json()

      if (data.success) {
        fetchTodos()
      }
    } catch (error) {
      console.error("Failed to update todo:", error)
      throw error
    }
  }

  // Delete todo
  const handleDeleteTodo = async (id: string) => {
    // Optimistic update
    setTodos((prev) => prev.filter((todo) => todo.id !== id))

    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: "DELETE",
      })
      const data = await response.json()

      if (data.success) {
        fetchTodos()
      }
    } catch (error) {
      console.error("Failed to delete todo:", error)
      fetchTodos()
    }
  }

  // Reorder todos
  const handleReorderTodos = async (todoIds: string[]) => {
    // Optimistic update
    const reorderedTodos = todoIds.map((id) => todos.find((t) => t.id === id)!).filter(Boolean)
    setTodos(reorderedTodos)

    try {
      await fetch("/api/todos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todoIds }),
      })
    } catch (error) {
      console.error("Failed to reorder todos:", error)
      fetchTodos()
    }
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
      <div className="j-content j-col j-gap-4">
        {/* Stat strip + view tabs */}
        <div className="j-row j-between">
          <div className="j-row j-gap-2">
            {(["today","upcoming","all","completed"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`j-pill ${view === v ? "j-proj" : "j-ghost"}`}
                style={{ cursor: "pointer", border: "none", textTransform: "capitalize" }}
              >
                {v === "all" ? `All (${counts.active})` : v === "completed" ? `Done (${counts.completed})` : v === "today" ? `Today (${counts.today})` : `Upcoming (${counts.upcoming})`}
              </button>
            ))}
          </div>
          <div className="j-row j-gap-2">
            <span className="j-muted" style={{ fontSize: 12 }}>{counts.active} active · {counts.completed} done</span>
          </div>
        </div>

        {/* Quick add */}
        <div className="j-card">
          <TodoQuickAdd
            onAdd={handleAddTodo}
            projects={projects}
            isLoading={isAdding}
          />
        </div>

        {/* Filters */}
        <TodoFilters
          view={view}
          onViewChange={setView}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          projectFilter={projectFilter}
          onProjectChange={setProjectFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          projects={projects}
          counts={counts}
        />

        {/* Todo list */}
        <div className="j-card">
          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span className="j-muted" style={{ fontSize: 13 }}>Loading todos…</span>
            </div>
          ) : (
            <TodoList
              todos={todos}
              onToggle={handleToggleTodo}
              onEdit={handleEditTodo}
              onDelete={handleDeleteTodo}
              onReorder={handleReorderTodos}
              emptyMessage={
                view === "today"
                  ? "No todos due today. Enjoy your day!"
                  : view === "upcoming"
                  ? "No upcoming todos in the next 7 days."
                  : view === "completed"
                  ? "No completed todos yet."
                  : "No todos yet. Add one above to get started!"
              }
            />
          )}
        </div>
      </div>

      <TodoEditModal
        todo={editingTodo}
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingTodo(null)
        }}
        onSave={handleSaveTodo}
        projects={projects}
      />
    </DashboardLayout>
  )
}
