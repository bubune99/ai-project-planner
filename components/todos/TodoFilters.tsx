"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, X, Calendar, CalendarDays, List, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TodoPriority } from "@/lib/types"

interface Project {
  id: string
  name: string
}

interface TodoFiltersProps {
  view: "today" | "upcoming" | "all" | "completed"
  onViewChange: (view: "today" | "upcoming" | "all" | "completed") => void
  priorityFilter: string
  onPriorityChange: (priority: string) => void
  projectFilter: string
  onProjectChange: (projectId: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  projects?: Project[]
  counts?: {
    today: number
    upcoming: number
    active: number
    completed: number
  }
}

const views = [
  { id: "today", label: "Today", icon: Calendar },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "all", label: "All", icon: List },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
] as const

export function TodoFilters({
  view,
  onViewChange,
  priorityFilter,
  onPriorityChange,
  projectFilter,
  onProjectChange,
  searchQuery,
  onSearchChange,
  projects = [],
  counts,
}: TodoFiltersProps) {
  const hasFilters = priorityFilter || projectFilter || searchQuery

  const clearFilters = () => {
    onPriorityChange("")
    onProjectChange("")
    onSearchChange("")
  }

  return (
    <div className="space-y-4">
      {/* View Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        {views.map((v) => {
          const Icon = v.icon
          const count = counts?.[v.id as keyof typeof counts]

          return (
            <Button
              key={v.id}
              variant={view === v.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewChange(v.id)}
              className={cn(
                "gap-1.5",
                view === v.id && "bg-background shadow-sm"
              )}
            >
              <Icon className="w-4 h-4" />
              {v.label}
              {count !== undefined && count > 0 && (
                <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </Button>
          )
        })}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search todos..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 w-[200px]"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => onSearchChange("")}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Priority Filter */}
        <Select value={priorityFilter || "__all__"} onValueChange={(v) => onPriorityChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All priorities</SelectItem>
            <SelectItem value="urgent">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Urgent
              </span>
            </SelectItem>
            <SelectItem value="high">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                High
              </span>
            </SelectItem>
            <SelectItem value="medium">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                Medium
              </span>
            </SelectItem>
            <SelectItem value="low">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Low
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Project Filter */}
        {projects.length > 0 && (
          <Select value={projectFilter || "__all__"} onValueChange={(v) => onProjectChange(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All projects</SelectItem>
              <SelectItem value="unlinked">No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear Filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
