"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DocumentFormModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  parentId?: string | null
  document?: any // For editing
}

export function DocumentFormModal({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  parentId,
  document,
}: DocumentFormModalProps) {
  const [title, setTitle] = useState(document?.title || "")
  const [description, setDescription] = useState(document?.description || "")
  const [docType, setDocType] = useState(document?.doc_type || "general")
  const [content, setContent] = useState(document?.content || "")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isChapter = !parentId && !document?.parent_id

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const payload = {
        title,
        description,
        doc_type: docType,
        content: content || null,
        parent_id: parentId || null,
        // For chapters, we don't set content initially
        // For pages, we allow inline content
        ...(isChapter ? {} : { content }),
      }

      const url = document ? `/api/documents/${document.id}` : `/api/projects/${projectId}/documents`

      const response = await fetch(url, {
        method: document ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error("Failed to save document")

      onSuccess()
      handleClose()
    } catch (error) {
      console.error("[v0] Failed to save document:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setTitle("")
    setDescription("")
    setDocType("general")
    setContent("")
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {document ? "Edit" : "Create"} {isChapter ? "Chapter" : "Page"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isChapter ? "e.g., Architecture" : "e.g., System Design"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this document"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="docType">Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="architecture">Architecture</SelectItem>
                <SelectItem value="api">API Documentation</SelectItem>
                <SelectItem value="ui_ux">UI/UX Design</SelectItem>
                <SelectItem value="requirements">Requirements</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
                <SelectItem value="deployment">Deployment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isChapter && (
            <div className="space-y-2">
              <Label htmlFor="content">Content (Markdown)</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your documentation in markdown..."
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports markdown formatting. A rich text editor will be integrated soon.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : document ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
