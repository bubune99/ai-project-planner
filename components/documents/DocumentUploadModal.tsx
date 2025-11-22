"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, File, X, AlertCircle } from "lucide-react"

interface DocumentUploadModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function DocumentUploadModal({ projectId, isOpen, onClose, onSuccess }: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("other")
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      if (!title) {
        setTitle(selectedFile.name)
      }
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      setError("Please select a file to upload")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("projectId", projectId)
      formData.append("title", title || file.name)
      formData.append("description", description)
      formData.append("category", category)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Upload failed" }))
        throw new Error(errorData.error || "Upload failed")
      }

      const data = await response.json()

      if (data.duplicate) {
        setError(`This file already exists: "${data.existingTitle}"`)
        setIsUploading(false)
        return
      }

      // Reset form
      setFile(null)
      setTitle("")
      setDescription("")
      setCategory("other")
      onSuccess()
      onClose()
    } catch (err) {
      console.error("Upload error:", err)
      setError(err instanceof Error ? err.message : "Failed to upload document")
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (!isUploading) {
      setFile(null)
      setTitle("")
      setDescription("")
      setCategory("other")
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-white/10 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Upload Document</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <div className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center hover:border-white/20 transition-colors">
              <input
                id="file"
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.json"
                disabled={isUploading}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <File className="h-8 w-8 text-blue-500" />
                  <div className="text-left">
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-sm">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)} disabled={isUploading}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label htmlFor="file" className="cursor-pointer">
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-white font-medium mb-1">Click to upload or drag and drop</p>
                  <p className="text-muted-foreground text-sm">Images, PDFs, documents (max 50MB)</p>
                </label>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="bg-black/40 border-white/10"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={isUploading}>
              <SelectTrigger className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prd">PRD</SelectItem>
                <SelectItem value="design">Design</SelectItem>
                <SelectItem value="spec">Specification</SelectItem>
                <SelectItem value="diagram">Diagram</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this document"
              className="bg-black/40 border-white/10"
              rows={3}
              disabled={isUploading}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1 bg-transparent"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUploading || !file} className="flex-1 bg-blue-500 hover:bg-blue-600">
              {isUploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
