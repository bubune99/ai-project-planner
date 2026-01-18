"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Plus, CalendarIcon, Flag, Link2, X } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import type { TodoPriority } from "@/lib/types"

interface Project {
  id: string
  name: string
}

interface TodoQuickAddProps {
  onAdd: (todo: {
    title: string
    priority?: TodoPriority
    dueDate?: string
    projectId?: string
  }) => void
  projects?: Project[]
  isLoading?: boolean
}

export function TodoQuickAdd({ onAdd, projects = [], isLoading }: TodoQuickAddProps) {
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<TodoPriority>("medium")
  const [dueDate, setDueDate] = useState<Date | undefined>()
  const [projectId, setProjectId] = useState<string>("")
  const [showOptions, setShowOptions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onAdd({
      title: title.trim(),
      priority,
      dueDate: dueDate?.toISOString(),
      projectId: projectId || undefined,
    })

    // Reset form
    setTitle("")
    setPriority("medium")
    setDueDate(undefined)
    setProjectId("")
    setShowOptions(false)

    // Refocus input
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e)
    }
    if (e.key === "Escape") {
      setTitle("")
      setShowOptions(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Add a new todo... (press Enter to save)"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (e.target.value && !showOptions) {
                setShowOptions(true)
              }
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => title && setShowOptions(true)}
            className="pr-10"
            disabled={isLoading}
          />
          {title && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => {
                setTitle("")
                setShowOptions(false)
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <Button type="submit" disabled={!title.trim() || isLoading}>
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Options row - shown when typing */}
      {showOptions && (
        <div className="flex items-center gap-2 flex-wrap animate-in slide-in-from-top-2 duration-200">
          {/* Priority */}
          <Select value={priority} onValueChange={(v) => setPriority(v as TodoPriority)}>
            <SelectTrigger className="w-[120px] h-8">
              <Flag className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Low
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  Medium
                </span>
              </SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  High
                </span>
              </SelectItem>
              <SelectItem value="urgent">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Urgent
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Due Date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 justify-start text-left font-normal",
                  !dueDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dueDate ? format(dueDate, "MMM d") : "Due date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={setDueDate}
                initialFocus
              />
              {dueDate && (
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setDueDate(undefined)}
                  >
                    Clear date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Project Link */}
          {projects.length > 0 && (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[150px] h-8">
                <Link2 className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Link project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </form>
  )
}
