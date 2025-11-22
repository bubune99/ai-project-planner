"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ChapterFormModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  chapter?: any
}

export function ChapterFormModal({ projectId, isOpen, onClose, onSuccess, chapter }: ChapterFormModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("📁")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title || "")
      setDescription(chapter.description || "")
      setIcon(chapter.icon || "📁")
    } else {
      setTitle("")
      setDescription("")
      setIcon("📁")
    }
  }, [chapter, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = chapter
        ? `/api/projects/${projectId}/doc-chapters/${chapter.id}`
        : `/api/projects/${projectId}/doc-chapters`

      const response = await fetch(url, {
        method: chapter ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          icon,
        }),
      })

      if (!response.ok) throw new Error("Failed to save chapter")

      onSuccess()
      onClose()
    } catch (error) {
      console.error("[v0] Failed to save chapter:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{chapter ? "Edit" : "Create"} Chapter</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Architecture"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this chapter"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon">Icon (emoji)</Label>
            <Input id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📁" maxLength={2} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : chapter ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
