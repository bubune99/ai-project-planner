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
}

export function NewProjectModal({ open, onOpenChange }: NewProjectModalProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "planning" as "planning" | "in_progress" | "review" | "completed" | "on_hold",
    phase: "",
  })
  const [techStack, setTechStack] = useState<string[]>([])
  const [currentTech, setCurrentTech] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    setIsSubmitting(true)

    // Generate a unique project ID
    const projectId = formData.name.toLowerCase().replace(/\s+/g, "-")

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Navigate to the new project
    router.push(`/project/${projectId}`)

    setIsSubmitting(false)
    onOpenChange(false)
  }

  const isFormValid = formData.name.trim() && formData.description.trim() && formData.phase.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-zinc-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create New Project</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set up a new project with AI-powered planning and management
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-white">
              Project Name *
            </Label>
            <Input
              id="name"
              placeholder="E-commerce Platform"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-black/40 border-white/10"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-white">
              Description *
            </Label>
            <Textarea
              id="description"
              placeholder="Describe your project goals and key features..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-black/40 border-white/10 min-h-[100px] resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status" className="text-white">
                Initial Status
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="bg-black/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Phase */}
            <div className="space-y-2">
              <Label htmlFor="phase" className="text-white">
                Starting Phase *
              </Label>
              <Input
                id="phase"
                placeholder="Phase 1: Foundation"
                value={formData.phase}
                onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                className="bg-black/40 border-white/10"
                required
              />
            </div>
          </div>

          {/* Tech Stack */}
          <div className="space-y-2">
            <Label htmlFor="techStack" className="text-white">
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
                className="bg-black/40 border-white/10"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTech}
                className="border-white/10 hover:bg-white/5"
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
                    className="bg-blue-500/20 text-blue-300 border-blue-500/30 px-3 py-1"
                  >
                    {tech}
                    <button
                      type="button"
                      onClick={() => handleRemoveTech(tech)}
                      className="ml-2 hover:text-white"
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
              className="border-white/10 hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
