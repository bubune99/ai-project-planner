"use client"

import { useState } from "react"
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { X, Plus } from 'lucide-react'

interface NewProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectCreated?: () => void
}

export function NewProjectModal({ open, onOpenChange, onProjectCreated }: NewProjectModalProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "planning" as "planning" | "in-progress" | "review" | "completed" | "on-hold",
    phase: "",
  })
  const [techStack, setTechStack] = useState<string[]>([])
  const [currentTech, setCurrentTech] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddTech = () => {
    if (currentTech.trim() && !techStack.includes(currentTech.trim())) {
      setTechStack([...techStack, currentTech.trim()])
      setCurrentTech("")
    }
  }

  const handleRemoveTech = (tech: string) => {
    setTechStack(techStack.filter((t) => t !== tech))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Create is never dimmed without a reason: what is missing is said in words.
    const missing = [!formData.name.trim() && "a name", !formData.description.trim() && "a description", !formData.phase.trim() && "a starting phase"].filter(Boolean)
    if (missing.length) { setError(`Still needed: ${missing.join(", ")}.`); return }
    setIsSubmitting(true)
    setError(null)

    try {
      // Call the API to create the project
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          status: formData.status,
          metadata: {
            phase: formData.phase,
            techStack,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create project")
      }

      const data = await response.json()
      const projectId = data.data.id

      // Close modal and refresh projects list
      onOpenChange(false)

      // Call the callback to refresh the projects list
      if (onProjectCreated) {
        onProjectCreated()
      }

      // Reset form
      setFormData({
        name: "",
        description: "",
        status: "planning",
        phase: "",
      })
      setTechStack([])

      // Navigate to the new project
      router.push(`/project/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create New Project</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set up a new project with AI-powered planning and management
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {error && (
            <p role="alert" className="opx-ch-need" style={{ margin: 0 }}>{error}</p>
          )}

          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Project Name *
            </Label>
            <Input
              id="name"
              placeholder="E-commerce Platform"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description *
            </Label>
            <Textarea
              id="description"
              placeholder="Describe your project goals and key features..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[100px] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">
                Initial Status
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="status" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Phase */}
            <div className="space-y-2">
              <Label htmlFor="phase">
                Starting Phase *
              </Label>
              <Input
                id="phase"
                placeholder="Phase 1: Foundation"
                value={formData.phase}
                onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
              />
            </div>
          </div>

          {/* Tech Stack */}
          <div className="space-y-2">
            <Label htmlFor="techStack">
              Tech Stack
            </Label>
            <div className="flex gap-2">
              <Input
                id="techStack"
                placeholder="Add technology (e.g., Next.js, PostgreSQL)"
                value={currentTech}
                onChange={(e) => setCurrentTech(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddTech()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTech}
                aria-label="Add this technology"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {techStack.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {techStack.map((tech) => (
                  <Badge
                    key={tech}
                    variant="secondary"
                    className="px-3 py-1"
                  >
                    {tech}
                    <button
                      type="button"
                      onClick={() => handleRemoveTech(tech)}
                      aria-label={`Remove ${tech}`}
                      className="ml-1 -mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
