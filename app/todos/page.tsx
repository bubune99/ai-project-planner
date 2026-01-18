"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, CheckSquare } from "lucide-react"
import Link from "next/link"

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

  // Loading state
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <CheckSquare className="w-6 h-6 text-primary" />
                <h1 className="text-xl font-semibold">My Todos</h1>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{counts.active}</span> active
              </span>
              <span>
                <span className="font-medium text-foreground">{counts.completed}</span> completed
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Quick Add */}
          <Card className="p-4">
            <TodoQuickAdd
              onAdd={handleAddTodo}
              projects={projects}
              isLoading={isAdding}
            />
          </Card>

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

          {/* Todo List */}
          <Card className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
          </Card>
        </div>
      </main>

      {/* Edit Modal */}
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
    </div>
  )
}
