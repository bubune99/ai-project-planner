"use client"

import type React from "react"

import { useState } from "react"
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
  chapter?: {
    id: string
    title: string
    description: string
    icon: string
    order_index: number
  }
}

export function ChapterFormModal({ projectId, isOpen, onClose, onSuccess, chapter }: ChapterFormModalProps) {
  const [title, setTitle] = useState(chapter?.title || "")
  const [description, setDescription] = useState(chapter?.description || "")
  const [icon, setIcon] = useState(chapter?.icon || "📄")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = chapter
        ? `/api/projects/${projectId}/doc-chapters/${chapter.id}`
        : `/api/projects/${projectId}/doc-chapters`

      const method = chapter ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          icon,
          order_index: chapter?.order_index || 0,
        }),
      })

      if (response.ok) {
        onSuccess()
        onClose()
        setTitle("")
        setDescription("")
        setIcon("📄")
      }
    } catch (error) {
      console.error("[v0] Error saving chapter:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{chapter ? "Edit Chapter" : "New Chapter"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Input id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📄" maxLength={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Getting Started"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Introduction and setup guide"
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
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
