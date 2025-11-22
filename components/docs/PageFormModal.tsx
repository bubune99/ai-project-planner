"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface PageFormModalProps {
  projectId: string
  chapterId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  page?: any
}

export function PageFormModal({ projectId, chapterId, isOpen, onClose, onSuccess, page }: PageFormModalProps) {
  const [title, setTitle] = useState(page?.title || "")
  const [content, setContent] = useState(page?.content || "")
  const [icon, setIcon] = useState(page?.icon || "📄")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = page ? `/api/projects/${projectId}/doc-pages/${page.id}` : `/api/projects/${projectId}/doc-pages`

      const response = await fetch(url, {
        method: page ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          icon,
          chapter_id: chapterId,
        }),
      })

      if (!response.ok) throw new Error("Failed to save page")

      onSuccess()
      onClose()

      // Reset form
      setTitle("")
      setContent("")
      setIcon("📄")
    } catch (error) {
      console.error("[v0] Failed to save page:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{page ? "Edit" : "Create"} Page</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., System Design"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon">Icon (emoji)</Label>
            <Input id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📄" maxLength={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content (Markdown)</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your documentation in markdown..."
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supports markdown formatting. A rich text editor will be integrated soon.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : page ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
