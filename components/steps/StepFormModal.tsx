"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toDateInput } from "@/lib/scheduling"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, CircleDot, Flag, GitBranch, Layers, Plus, Timer, User, X } from "lucide-react"
import { toast } from "sonner"

interface StepFormModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  step?: any // Existing step for editing
  availableSteps?: any[] // For dependency selection
  onSuccess?: () => void
}

/**
 * One property row: a muted icon + label on the left, the control on the right.
 * Modelled on a ClickUp task panel, where every field reads as a row and an
 * unset one still shows its name with "Empty" beside it — so the shape of a
 * task is legible at a glance instead of hidden behind collapsed sections.
 */
function Field({
  icon,
  label,
  htmlFor,
  children,
}: {
  icon: React.ReactNode
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 min-h-[32px]">
      <Label
        htmlFor={htmlFor}
        className="flex items-center gap-1.5 w-[104px] shrink-0 text-xs font-normal text-muted-foreground [&_svg]:size-3.5 [&_svg]:opacity-70"
      >
        {icon}
        {label}
      </Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export function StepFormModal({ open, onClose, projectId, step, availableSteps = [], onSuccess }: StepFormModalProps) {
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    phase: "",
    stage: "",
    estimated_hours: "",
    assigned_agent: "",
    priority: "medium",
    status: "pending",
    // Dates were absent from this form entirely, which is why 414 steps had no
    // schedule and the Gantt invented one for each of them.
    start_date: "",
    end_date: "",
    tasks: [] as string[],
    dependencies: [] as { depends_on_step_id: string; dependency_type: string }[],
  })

  const [newTask, setNewTask] = useState("")
  const [selectedDependency, setSelectedDependency] = useState("")

  useEffect(() => {
    if (step) {
      setFormData({
        title: step.title || "",
        description: step.description || "",
        phase: step.phase || "",
        stage: step.stage || "",
        estimated_hours: step.estimated_hours || "",
        assigned_agent: step.assigned_agent || "",
        priority: step.priority || "medium",
        status: step.status || "pending",
        start_date: toDateInput(step.start_date ?? step.startDate),
        end_date: toDateInput(step.end_date ?? step.endDate),
        tasks: step.tasks || [],
        dependencies: step.dependencies || [],
      })
    } else {
      setFormData({
        title: "",
        description: "",
        phase: "",
        stage: "",
        estimated_hours: "",
        assigned_agent: "",
        priority: "medium",
        status: "pending",
        start_date: "",
        end_date: "",
        tasks: [],
        dependencies: [],
      })
    }
  }, [step, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = step ? `/api/projects/${projectId}/steps/${step.id}` : `/api/projects/${projectId}/steps`

      const method = step ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          estimated_hours: formData.estimated_hours ? Number.parseFloat(formData.estimated_hours) : null,
          // The PATCH route keys off property PRESENCE, so always send both:
          // an empty field means "clear the date", not "leave it alone".
          start_date: formData.start_date ? new Date(`${formData.start_date}T12:00:00`).toISOString() : null,
          end_date: formData.end_date ? new Date(`${formData.end_date}T12:00:00`).toISOString() : null,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save step")
      }

      toast.success(step ? "Step updated" : "Step created")

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error("[v0] Error saving step:", error)
      toast.error("Failed to save step. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const addTask = () => {
    if (newTask.trim()) {
      setFormData({ ...formData, tasks: [...formData.tasks, newTask.trim()] })
      setNewTask("")
    }
  }

  const removeTask = (index: number) => {
    setFormData({ ...formData, tasks: formData.tasks.filter((_, i) => i !== index) })
  }

  const addDependency = () => {
    if (selectedDependency && !formData.dependencies.some((d) => d.depends_on_step_id === selectedDependency)) {
      setFormData({
        ...formData,
        dependencies: [...formData.dependencies, { depends_on_step_id: selectedDependency, dependency_type: "hard" }],
      })
      setSelectedDependency("")
    }
  }

  const removeDependency = (stepId: string) => {
    setFormData({
      ...formData,
      dependencies: formData.dependencies.filter((d) => d.depends_on_step_id !== stepId),
    })
  }

  const getDependencyName = (stepId: string) => {
    return availableSteps.find((s) => s.id === stepId)?.title || stepId
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-0">
          <DialogTitle className="sr-only">{step ? "Edit step" : "New step"}</DialogTitle>
          {/* The title IS the heading, as in a ClickUp task, rather than a
              labelled form row competing with "Edit Step" above it. */}
          <Input
            id="title"
            aria-label="Step title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Untitled step"
            required
            className="!text-xl font-semibold h-auto px-0 py-1 border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Property grid — label on the left, control on the right, two
              columns, the way a ClickUp task reads. Replaces three separate
              label-above-control rows that each consumed a full line. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {step && (
              <Field icon={<CircleDot />} label="Status" htmlFor="status">
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger id="status" className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus:ring-0 text-xs">
                    <SelectValue placeholder="Empty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">To Do</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Complete</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field icon={<User />} label="Assigned agent" htmlFor="agent">
              <Select value={formData.assigned_agent} onValueChange={(v) => setFormData({ ...formData, assigned_agent: v })}>
                <SelectTrigger id="agent" className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus:ring-0 text-xs">
                  <SelectValue placeholder="Empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v0">v0</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="gpt">GPT</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field icon={<CalendarDays />} label="Start date" htmlFor="start_date">
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                max={formData.end_date || undefined}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus-visible:ring-0 text-xs"
              />
            </Field>

            <Field icon={<CalendarDays />} label="Due date" htmlFor="end_date">
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                min={formData.start_date || undefined}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus-visible:ring-0 text-xs"
              />
            </Field>

            <Field icon={<Flag />} label="Priority" htmlFor="priority">
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger id="priority" className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus:ring-0 text-xs">
                  <SelectValue placeholder="Empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field icon={<Timer />} label="Estimate (h)" htmlFor="estimated_hours">
              <Input
                id="estimated_hours"
                type="number"
                step="0.5"
                value={formData.estimated_hours}
                onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                placeholder="Empty"
                className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus-visible:ring-0 text-xs"
              />
            </Field>

            <Field icon={<Layers />} label="Phase" htmlFor="phase">
              <Select value={formData.phase} onValueChange={(v) => setFormData({ ...formData, phase: v })}>
                <SelectTrigger id="phase" className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus:ring-0 text-xs">
                  <SelectValue placeholder="Empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ideation">Ideation</SelectItem>
                  <SelectItem value="architecture">Architecture</SelectItem>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="deployment">Deployment</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field icon={<GitBranch />} label="Stage" htmlFor="stage">
              <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                <SelectTrigger id="stage" className="h-7 border-0 bg-transparent px-2 hover:bg-accent focus:ring-0 text-xs">
                  <SelectValue placeholder="Empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setup">Setup</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="deployment">Deployment</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {!formData.start_date && !formData.end_date && (
            <p className="text-xs text-muted-foreground">
              No dates: this step stays in the Unscheduled list and is not drawn on the timeline.
            </p>
          )}

          {/* Description sits below the properties, as it does in a task view */}
          <div>
            <Label htmlFor="description" className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add a description..."
              rows={3}
              className="mt-1 text-sm"
            />
          </div>

          {/* Tasks/Checklist */}
          <div>
            <Label>Tasks / Checklist</Label>
            <div className="flex gap-2 mb-2">
              <Input
                aria-label="Add a checklist subtask"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Add a subtask..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTask()
                  }
                }}
              />
              <Button type="button" onClick={addTask} size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {formData.tasks.map((task, index) => (
                <div key={index} className="flex items-center gap-2 text-sm bg-accent/50 px-3 py-2 rounded">
                  <span className="flex-1">{task}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeTask(index)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Dependencies */}
          {availableSteps.length > 0 && (
            <div>
              <Label>Dependencies</Label>
              <div className="flex gap-2 mb-2">
                <Select value={selectedDependency} onValueChange={setSelectedDependency}>
                  <SelectTrigger aria-label="Select a step this one depends on">
                    <SelectValue placeholder="Select a step..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSteps
                      .filter((s) => s.id !== step?.id)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addDependency} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.dependencies.map((dep) => (
                  <Badge key={dep.depends_on_step_id} variant="secondary" className="gap-2">
                    {getDependencyName(dep.depends_on_step_id)}
                    <button
                      type="button"
                      onClick={() => removeDependency(dep.depends_on_step_id)}
                      className="hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : step ? "Update Step" : "Create Step"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
