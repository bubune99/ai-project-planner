"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { FileText, Folder } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NovelEditor } from "./NovelEditor"

interface PageFormModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  editPage?: {
    id: string
    title: string
    description?: string
    content?: string
    parent_id?: string
    doc_type: "chapter" | "page"
  }
  chapters: Array<{ id: string; title: string }>
}

export function PageFormModal({ projectId, isOpen, onClose, onSuccess, editPage, chapters }: PageFormModalProps) {
  const [formData, setFormData] = useState({
    title: editPage?.title || "",
    description: editPage?.description || "",
    content: editPage?.content || "",
    parent_id: editPage?.parent_id || "",
    doc_type: editPage?.doc_type || ("page" as "chapter" | "page"),
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Update form data when editPage changes
  useEffect(() => {
    if (editPage) {
      setFormData({
        title: editPage.title || "",
        description: editPage.description || "",
        content: editPage.content || "",
        parent_id: editPage.parent_id || "",
        doc_type: editPage.doc_type || "page",
      })
    }
  }, [editPage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = editPage ? `/api/documents/${editPage.id}` : `/api/projects/${projectId}/documents`

      const method = editPage ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          parent_id: formData.doc_type === "page" ? formData.parent_id : null,
          doc_type: formData.doc_type,
          content: formData.content,
          category: formData.doc_type === "chapter" ? "chapter" : "documentation",
        }),
      })

      if (!response.ok) throw new Error("Failed to save page")

      onSuccess()
      onClose()
      // Reset form
      setFormData({
        title: "",
        description: "",
        content: "",
        parent_id: "",
        doc_type: "page",
      })
    } catch (error) {
      console.error("Error saving page:", error)
      alert("Failed to save page")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editPage ? "Edit" : "Create"} {formData.doc_type === "chapter" ? "Chapter" : "Page"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc_type">Type</Label>
            <Select
              value={formData.doc_type}
              onValueChange={(value: "chapter" | "page") =>
                setFormData({ ...formData, doc_type: value, parent_id: value === "chapter" ? "" : formData.parent_id })
              }
              disabled={!!editPage}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chapter">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Chapter (Top-level section)
                  </div>
                </SelectItem>
                <SelectItem value="page">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Page (Under a chapter)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.doc_type === "page" && (
            <div className="space-y-2">
              <Label htmlFor="parent_id">Parent Chapter</Label>
              <Select
                value={formData.parent_id}
                onValueChange={(value) => setFormData({ ...formData, parent_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a chapter..." />
                </SelectTrigger>
                <SelectContent>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={formData.doc_type === "chapter" ? "e.g., Getting Started" : "e.g., Installation Guide"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this content..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <NovelEditor
              initialContent={formData.content}
              onChange={(content) => setFormData({ ...formData, content })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editPage ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
