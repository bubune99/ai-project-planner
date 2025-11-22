"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { X, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface StepFormModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  step?: any // Existing step for editing
  availableSteps?: any[] // For dependency selection
  onSuccess?: () => void
}

export function StepFormModal({ open, onClose, projectId, step, availableSteps = [], onSuccess }: StepFormModalProps) {
  const { toast } = useToast()
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
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save step")
      }

      toast({
        title: step ? "Step updated" : "Step created",
        description: step ? "The step has been updated successfully." : "A new step has been created.",
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error("[v0] Error saving step:", error)
      toast({
        title: "Error",
        description: "Failed to save step. Please try again.",
        variant: "destructive",
      })
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
        <DialogHeader>
          <DialogTitle>{step ? "Edit Step" : "Create New Step"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Set up authentication"
              required
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of what needs to be done..."
              rows={3}
            />
          </div>

          {/* Row: Phase, Stage, Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="phase">Phase</Label>
              <Select value={formData.phase} onValueChange={(value) => setFormData({ ...formData, phase: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select phase" />
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
            </div>

            <div>
              <Label htmlFor="stage">Stage</Label>
              <Select value={formData.stage} onValueChange={(value) => setFormData({ ...formData, stage: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setup">Setup</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="deployment">Deployment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {step && (
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Row: Agent, Priority, Estimate */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="agent">Assigned Agent</Label>
              <Select
                value={formData.assigned_agent}
                onValueChange={(value) => setFormData({ ...formData, assigned_agent: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v0">v0</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="gpt">GPT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="estimated_hours">Estimated Hours</Label>
              <Input
                id="estimated_hours"
                type="number"
                step="0.5"
                value={formData.estimated_hours}
                onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                placeholder="e.g., 4"
              />
            </div>
          </div>

          {/* Tasks/Checklist */}
          <div>
            <Label>Tasks / Checklist</Label>
            <div className="flex gap-2 mb-2">
              <Input
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
                  <SelectTrigger>
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
