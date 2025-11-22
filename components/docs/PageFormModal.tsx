"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PageFormModalProps {
  projectId: string
  chapterId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  page?: {
    id: string
    title: string
    slug: string
    icon: string
    order_index: number
  }
}

export function PageFormModal({ projectId, chapterId, isOpen, onClose, onSuccess, page }: PageFormModalProps) {
  const [title, setTitle] = useState(page?.title || "")
  const [slug, setSlug] = useState(page?.slug || "")
  const [icon, setIcon] = useState(page?.icon || "📝")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = page ? `/api/projects/${projectId}/doc-pages/${page.id}` : `/api/projects/${projectId}/doc-pages`

      const method = page ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: chapterId,
          title,
          slug: slug || title.toLowerCase().replace(/\s+/g, "-"),
          icon,
          order_index: page?.order_index || 0,
          last_edited_by: "User",
        }),
      })

      if (response.ok) {
        onSuccess()
        onClose()
        setTitle("")
        setSlug("")
        setIcon("📝")
      }
    } catch (error) {
      console.error("[v0] Error saving page:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{page ? "Edit Page" : "New Page"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Input id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📝" maxLength={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (!page) {
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                }
              }}
              placeholder="Installation"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="installation" />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
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
