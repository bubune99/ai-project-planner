"use client"

import { useState, useEffect } from "react"
import { X, Search, Upload, FolderOpen, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DocumentCard } from "./DocumentCard"
import { DocumentPreview } from "./DocumentPreview"
import type { Document } from "@/lib/types"

interface DocumentBrowserProps {
  projectId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDocumentSelect?: (document: Document) => void
}

export function DocumentBrowser({ projectId, open, onOpenChange, onDocumentSelect }: DocumentBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch documents when the sheet opens and we have a projectId
  useEffect(() => {
    if (open && projectId) {
      fetchDocuments()
    }
  }, [open, projectId])

  const fetchDocuments = async () => {
    if (!projectId) return

    try {
      setLoading(true)
      const response = await fetch(`/api/projects/${projectId}/documents`)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const allTags = Array.from(new Set(documents.flatMap((doc) => doc.tags || [])))

  const filteredDocuments = documents
    .filter((doc) => {
      const matchesSearch = (doc.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTag = !selectedTag || (doc.tags || []).includes(selectedTag)
      return matchesSearch && matchesTag
    })
    .sort((a, b) => {
      if (sortBy === "recent") {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return bTime - aTime
      }
      return (a.title || '').localeCompare(b.title || '')
    })

  const handleDocumentClick = (document: Document) => {
    setSelectedDocument(document)
    onDocumentSelect?.(document)
  }

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">📄 Project Documents</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              
            </Button>
          </div>

          <div className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  !selectedTag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => setSelectedTag(null)}
              >
                All
              </button>
              {allTags.slice(0, 5).map((tag) => (
                <button
                  key={tag}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    selectedTag === tag
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                  onClick={() => handleTagClick(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "name")}
                className="text-xs bg-background border border-border rounded-md px-2 py-1"
              >
                <option value="recent">Recent ▼</option>
                <option value="name">Name ▼</option>
              </select>

              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  <Upload className="w-3 h-3 mr-1" />
                  Upload
                </Button>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">Loading documents...</p>
            </div>
          ) : selectedDocument ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDocument(null)} className="mb-4 -ml-2">
                ← Back to list
              </Button>
              <DocumentPreview
                document={selectedDocument}
                onLinkToTask={() => {
                  // TODO: Implement link to task functionality
                  console.log("Link to task:", selectedDocument.id)
                }}
              />
            </div>
          ) : (
            <>
              {filteredDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileSearch className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {documents.length === 0 ? 'No documents yet' : 'No documents found'}
                  </p>
                  {documents.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Upload your first document to get started!</p>
                  )}
                </div>
              ) : (
                filteredDocuments.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onClick={() => handleDocumentClick(doc)}
                    onTagClick={handleTagClick}
                  />
                ))
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 bg-transparent">
              <FolderOpen className="w-4 h-4 mr-2" />
              File Manager
            </Button>
            <Button variant="outline" size="sm" className="flex-1 bg-transparent">
              <FileSearch className="w-4 h-4 mr-2" />
              Find References
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
