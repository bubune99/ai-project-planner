"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, ImageIcon, FileCode, Download, Trash2, Eye, Search, AlertCircle, XCircle } from "lucide-react"
import { format } from "date-fns"

interface Document {
  id: string
  project_id: string
  title: string
  description: string | null
  file_url: string
  file_type: string
  file_size: number
  category: "prd" | "design" | "spec" | "diagram" | "other"
  tags: string[]
  version: number
  created_at: string
}

interface DocumentGalleryProps {
  projectId: string
}

export function DocumentGallery({ projectId }: DocumentGalleryProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "other" as Document["category"],
    tags: "",
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    fetchDocuments()
  }, [projectId])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/documents`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch documents' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch documents`)
      }

      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error("Failed to fetch documents:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while fetching documents')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload')
      return
    }

    try {
      setUploading(true)
      setError(null)

      const uploadFormData = new FormData()
      uploadFormData.append("file", selectedFile)
      uploadFormData.append("projectId", projectId)
      uploadFormData.append("title", formData.title || selectedFile.name)
      if (formData.description) uploadFormData.append("description", formData.description)
      uploadFormData.append("category", formData.category)
      if (formData.tags) uploadFormData.append("tags", formData.tags)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to upload document' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to upload document`)
      }

      setIsUploadModalOpen(false)
      setFormData({ title: "", description: "", category: "other", tags: "" })
      setSelectedFile(null)
      await fetchDocuments()
    } catch (error) {
      console.error("Failed to upload document:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while uploading document')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return

    try {
      setError(null)
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete document' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to delete document`)
      }

      await fetchDocuments()
    } catch (error) {
      console.error("Failed to delete document:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while deleting document')
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return <ImageIcon className="h-5 w-5" />
    if (fileType.includes("pdf")) return <FileText className="h-5 w-5" />
    if (fileType.includes("code") || fileType.includes("json")) return <FileCode className="h-5 w-5" />
    return <FileText className="h-5 w-5" />
  }

  const getCategoryColor = (category: Document["category"]) => {
    switch (category) {
      case "prd":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"
      case "design":
        return "bg-pink-500/20 text-pink-400 border-pink-500/30"
      case "spec":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "diagram":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === "all" || doc.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-400 text-sm font-medium">Error</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
            aria-label="Dismiss error"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Documents & Files</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage project documentation and design assets</p>
        </div>
        <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600 gap-2">
              <Upload className="h-4 w-4" />
              Upload File
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Upload Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="file">File</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Product Requirements Document"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                >
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
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the document..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="architecture, database, api"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                {uploading ? "Uploading..." : "Upload Document"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-black/40 border-white/10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] bg-black/40 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="prd">PRD</SelectItem>
            <SelectItem value="design">Design</SelectItem>
            <SelectItem value="spec">Specification</SelectItem>
            <SelectItem value="diagram">Diagram</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
      ) : filteredDocuments.length === 0 ? (
        <Card className="bg-gray-900/50 border-white/10 p-8 text-center">
          <p className="text-muted-foreground">No documents found. Upload your first document!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="bg-gray-900/50 border-white/10 p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-blue-500">{getFileIcon(doc.file_type)}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white truncate mb-1">{doc.title}</h3>
                  <Badge variant="outline" className={getCategoryColor(doc.category)}>
                    {doc.category}
                  </Badge>
                </div>
              </div>

              {doc.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{doc.description}</p>}

              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {doc.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs border-white/10">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="text-xs text-muted-foreground mb-4">
                <div>{formatFileSize(doc.file_size)}</div>
                <div>
                  v{doc.version} • {format(new Date(doc.created_at), "MMM dd, yyyy")}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-white/10 hover:bg-white/5 gap-1 bg-transparent"
                  onClick={() => window.open(doc.file_url, "_blank")}
                >
                  <Eye className="h-3 w-3" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 hover:bg-white/5 bg-transparent"
                  onClick={() => window.open(doc.file_url, "_blank")}
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 hover:bg-red-500/10 text-red-400 bg-transparent"
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
