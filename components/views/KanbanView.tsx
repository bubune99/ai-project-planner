"use client"

import { useState } from "react"
import type { KanbanTask } from "@/lib/types"
import { KanbanColumn } from "./KanbanColumn"
import { TaskDetailModal } from "./TaskDetailModal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, X } from "lucide-react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { useToast } from "@/hooks/use-toast"

interface KanbanViewProps {
  tasks?: KanbanTask[]
  onTaskSelect?: (task: KanbanTask | null) => void
}

export function KanbanView({ tasks: initialTasks, onTaskSelect }: KanbanViewProps) {
  const kanbanTasks = Array.isArray(initialTasks) && initialTasks.length > 0 ? initialTasks : []
  const [tasks, setTasks] = useState<KanbanTask[]>(kanbanTasks)
  const [searchQuery, setSearchQuery] = useState("")
  const [phaseFilter, setPhaseFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")
  const [sortBy, setSortBy] = useState("priority")
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const { toast } = useToast()

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result

    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const newStatus = destination.droppableId as KanbanTask["status"]
    const updatedTasks = tasks.map((task) => (task.id === draggableId ? { ...task, status: newStatus } : task))

    setTasks(updatedTasks)

    const statusLabels = {
      backlog: "Backlog",
      in_progress: "In Progress",
      review: "Review",
      complete: "Complete",
    }

    toast({
      title: "Task moved",
      description: `Moved to ${statusLabels[newStatus]}`,
    })
  }

  const handleView = (task: KanbanTask) => {
    setSelectedTask(task)
    setModalOpen(true)
    onTaskSelect?.(task)
  }

  const handleEdit = (task: KanbanTask) => {
    setSelectedTask(task)
    setModalOpen(true)
  }

  const handleDelete = (taskId: string) => {
    setTasks(tasks.filter((t) => t.id !== taskId))
    toast({
      title: "Task deleted",
      description: "Task has been removed",
      variant: "destructive",
    })
  }

  const handleUpdateTask = (updatedTask: KanbanTask) => {
    setTasks(tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
    toast({
      title: "Task updated",
      description: "Changes have been saved",
    })
  }

  const clearFilters = () => {
    setSearchQuery("")
    setPhaseFilter("all")
    setAgentFilter("all")
    setSortBy("priority")
  }

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter((task) => {
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesPhase = phaseFilter === "all" || task.phase.includes(phaseFilter)
      const matchesAgent = agentFilter === "all" || task.agent === agentFilter
      return matchesSearch && matchesPhase && matchesAgent
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      }
      return 0
    })

  const getTasksByStatus = (status: KanbanTask["status"]) => filteredTasks.filter((task) => task.status === status)

  return (
    <div className="h-full flex flex-col">
      {/* Filters & Search Bar */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Phases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              <SelectItem value="Phase 1">Phase 1</SelectItem>
              <SelectItem value="Phase 2">Phase 2</SelectItem>
              <SelectItem value="Phase 3">Phase 3</SelectItem>
              <SelectItem value="Phase 4">Phase 4</SelectItem>
            </SelectContent>
          </Select>

          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              <SelectItem value="v0">v0</SelectItem>
              <SelectItem value="claude">claude</SelectItem>
              <SelectItem value="gemini">gemini</SelectItem>
              <SelectItem value="gpt">gpt</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Sort by: Priority</SelectItem>
              <SelectItem value="estimate">Sort by: Estimate</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={clearFilters} title="Clear filters">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      {kanbanTasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center py-12">
            <p className="text-lg mb-2">No steps defined yet</p>
            <p className="text-sm">Create your first step to start tracking your project progress!</p>
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            <KanbanColumn
              title="Backlog"
              icon="📋"
              status="backlog"
              tasks={getTasksByStatus("backlog")}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
            <KanbanColumn
              title="In Progress"
              icon="🔄"
              status="in_progress"
              tasks={getTasksByStatus("in_progress")}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
            <KanbanColumn
              title="Review"
              icon="👁️"
              status="review"
              tasks={getTasksByStatus("review")}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
            <KanbanColumn
              title="Complete"
              icon="✅"
              status="complete"
              tasks={getTasksByStatus("complete")}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        </DragDropContext>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUpdate={handleUpdateTask}
      />
    </div>
  )
}
