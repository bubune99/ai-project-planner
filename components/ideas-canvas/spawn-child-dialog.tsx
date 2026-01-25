"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, GitBranch } from "lucide-react"
import { toast } from "sonner"

interface SpawnChildDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
  ideaTitle: string
  onSuccess?: (childIdea: any) => void
}

export function SpawnChildDialog({
  open,
  onOpenChange,
  ideaId,
  ideaTitle,
  onSuccess,
}: SpawnChildDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [inheritFacets, setInheritFacets] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const handleSpawn = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title for the child idea")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/ideas/${ideaId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "spawn",
          title: title.trim(),
          description: description.trim(),
          inheritOptions: {
            facets: inheritFacets,
          },
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to spawn child idea")
      }

      toast.success("Child idea created successfully")
      onSuccess?.(result.data.childIdea)
      handleClose()
    } catch (error) {
      console.error("Failed to spawn child:", error)
      toast.error(error instanceof Error ? error.message : "Failed to spawn child idea")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setTitle("")
    setDescription("")
    setInheritFacets(true)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-green-500" />
            Spawn Child Idea
          </DialogTitle>
          <DialogDescription>
            Create a new idea that branches from &quot;{ideaTitle}&quot;. The child idea will be
            linked to this parent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="child-title">Child Idea Title *</Label>
            <Input
              id="child-title"
              placeholder="Enter title for the new idea..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="child-description">Description</Label>
            <Textarea
              id="child-description"
              placeholder="Describe how this idea differs from the parent..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-3">
            <Label>Inheritance Options</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="inherit-facets"
                checked={inheritFacets}
                onCheckedChange={(checked) => setInheritFacets(checked === true)}
                disabled={isLoading}
              />
              <label
                htmlFor="inherit-facets"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Inherit facets from parent
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSpawn} disabled={isLoading || !title.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <GitBranch className="h-4 w-4 mr-2" />
                Create Child Idea
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
