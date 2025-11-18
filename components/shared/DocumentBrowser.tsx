"use client"

import { useState } from "react"
import { X, Search, Upload, FolderOpen, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DocumentCard } from "./DocumentCard"
import { DocumentPreview } from "./DocumentPreview"
import { mockDocuments } from "@/lib/mock-data"
import type { Document } from "@/lib/types"

interface DocumentBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDocumentSelect?: (document: Document) => void
}

export function DocumentBrowser({ open, onOpenChange, onDocumentSelect }: DocumentBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

  const allTags = Array.from(new Set(mockDocuments.flatMap((doc) => doc.tags)))

  const filteredDocuments = mockDocuments
    .filter((doc) => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTag = !selectedTag || doc.tags.includes(selectedTag)
      return matchesSearch && matchesTag
    })
    .sort((a, b) => {
      if (sortBy === "recent") {
        return b.lastModified.getTime() - a.lastModified.getTime()
      }
      return a.name.localeCompare(b.name)
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
              <X className="w-5 h-5" />
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
          {selectedDocument ? (
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
                  <p className="text-sm text-muted-foreground">No documents found</p>
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
