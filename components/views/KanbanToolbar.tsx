"use client"

import type { GroupBy, SortBy } from "./kanban-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  ArrowUpDown,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  ListFilter,
  Plus,
  Search,
  X,
} from "lucide-react"

export interface BoardFilters {
  priority: string // "all" | low|medium|high
  agent: string // "all" | v0|claude|gemini|gpt|none
  phase: string // "all" | <phase> | none
  tag: string // "all" | <tag>
  project?: string // "all" | <project id>, on the all-projects board
}

interface KanbanToolbarProps {
  searchQuery: string
  onSearchChange: (v: string) => void
  groupBy: GroupBy
  onGroupByChange: (v: GroupBy) => void
  sortBy: SortBy
  onSortByChange: (v: SortBy) => void
  filters: BoardFilters
  onFiltersChange: (f: BoardFilters) => void
  phases: string[]
  tags: string[]
  showCompleted: boolean
  onShowCompletedChange: (v: boolean) => void
  expandSubtasks: boolean
  onExpandSubtasksChange: (v: boolean) => void
  /** Absent on the all-projects board: a card is made on its project's own board. */
  onCreate?: () => void
  /** On the all-projects board: the projects to narrow to. */
  projects?: { id: string; name: string; count: number }[]
}

export const EMPTY_FILTERS: BoardFilters = { priority: "all", agent: "all", phase: "all", tag: "all" }

export function KanbanToolbar({
  searchQuery,
  onSearchChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  filters,
  onFiltersChange,
  phases,
  tags,
  showCompleted,
  onShowCompletedChange,
  expandSubtasks,
  onExpandSubtasksChange,
  onCreate,
  projects,
}: KanbanToolbarProps) {
  const activeFilterCount = Object.values(filters).filter((v) => v !== "all").length
  const anythingActive = activeFilterCount > 0 || !!searchQuery || !showCompleted

  const clearAll = () => {
    onFiltersChange(EMPTY_FILTERS)
    onSearchChange("")
    onShowCompletedChange(true)
  }

  return (
    <div className="opx-board-tools flex gap-2 items-center flex-wrap mb-4">
      {onCreate && (
        <Button onClick={onCreate} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          New task
        </Button>
      )}
      {projects && (
        <Select value={filters.project ?? "all"} onValueChange={(v) => onFiltersChange({ ...filters, project: v })}>
          <SelectTrigger className="h-8 w-[240px]" aria-label="Project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="relative flex-1 min-w-[180px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          aria-label="Search the tasks"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-8"
        />
      </div>

      {/* Pushes the view controls right on a wide screen. Hidden on a phone, where the row wraps and an empty spacer
          left a gap before Group (owner comment 4999ccf1, "The drop downs need review"). */}
      <div className="hidden sm:block flex-1" aria-hidden="true" />

      {/* Group by */}
      <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as GroupBy)}>
        <SelectTrigger className="w-auto min-w-[150px] h-8">
          <Layers className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="status">Group: Status</SelectItem>
          <SelectItem value="priority">Group: Priority</SelectItem>
          <SelectItem value="agent">Group: Agent</SelectItem>
          <SelectItem value="phase">Group: Phase</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
        <SelectTrigger className="w-auto min-w-[150px] h-8">
          <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="manual">Sort: Manual</SelectItem>
          <SelectItem value="priority">Sort: Priority</SelectItem>
          <SelectItem value="due">Sort: Due date</SelectItem>
          <SelectItem value="estimate">Sort: Estimate</SelectItem>
          <SelectItem value="title">Sort: Title</SelectItem>
        </SelectContent>
      </Select>

      {/* Filters */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <ListFilter className="w-3.5 h-3.5 mr-1.5" />
            Filter
            {activeFilterCount > 0 && (
              <Badge className="ml-1.5 h-4 px-1 text-[12px]" variant="secondary">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div>
            <Label className="text-xs mb-1 block">Priority</Label>
            <Select
              value={filters.priority}
              onValueChange={(v) => onFiltersChange({ ...filters, priority: v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="none">No priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Agent</Label>
            <Select
              value={filters.agent}
              onValueChange={(v) => onFiltersChange({ ...filters, agent: v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="v0">v0</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="gpt">GPT</SelectItem>
                <SelectItem value="none">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Phase</Label>
            <Select
              value={filters.phase}
              onValueChange={(v) => onFiltersChange({ ...filters, phase: v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All phases</SelectItem>
                {phases.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tags.length > 0 && (
            <div>
              <Label className="text-xs mb-1 block">Tag</Label>
              <Select
                value={filters.tag}
                onValueChange={(v) => onFiltersChange({ ...filters, tag: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {tags.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
            >
              Clear filters
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {/* Expand/collapse subtasks on cards */}
      <Button
        variant={expandSubtasks ? "secondary" : "outline"}
        size="sm"
        className="h-8"
        aria-pressed={expandSubtasks}
        onClick={() => onExpandSubtasksChange(!expandSubtasks)}
        title={expandSubtasks ? "Collapse subtasks on cards" : "Expand subtasks on cards"}
      >
        <GitBranch className="w-3.5 h-3.5 mr-1.5" />
        Subtasks
      </Button>

      {/* Show/hide completed */}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        aria-pressed={showCompleted}
        onClick={() => onShowCompletedChange(!showCompleted)}
        title={showCompleted ? "Hide completed" : "Show completed"}
      >
        {showCompleted ? <Eye className="w-3.5 h-3.5 mr-1.5" /> : <EyeOff className="w-3.5 h-3.5 mr-1.5" />}
        Closed
      </Button>

      {anythingActive && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearAll} title="Clear all">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}
