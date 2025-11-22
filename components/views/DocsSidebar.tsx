"use client"

import { useState } from "react"
import { Search, ChevronRight, ChevronDown, Sparkles, FileText, Folder, Pencil, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface Document {
  id: string
  title: string
  description?: string
  doc_type: "chapter" | "page"
  parent_id?: string
}

interface DocsSidebarProps {
  documents: Document[]
  activeDocId: string
  onDocSelect: (doc: Document) => void
  onEditPage: (doc: Document) => void
  onDeletePage: (docId: string) => void
  onCreatePage: () => void
}

export function DocsSidebar({
  documents,
  activeDocId,
  onDocSelect,
  onEditPage,
  onDeletePage,
  onCreatePage,
}: DocsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null)

  // Organize documents into chapters and pages
  const chapters = documents.filter((doc) => doc.doc_type === "chapter")
  const pages = documents.filter((doc) => doc.doc_type === "page")

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const getChapterPages = (chapterId: string) => {
    return pages.filter((page) => page.parent_id === chapterId)
  }

  const orphanPages = pages.filter((page) => !page.parent_id)

  const filterDoc = (doc: Document) => {
    return doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  }

  const filteredChapters = chapters.filter(filterDoc)
  const filteredOrphans = orphanPages.filter(filterDoc)

  return (
    <div className="w-[280px] h-full border-r border-border/50 bg-card/30 backdrop-blur-md flex flex-col">
      {/* Search */}
      <div className="p-4 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-background/50"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Chapters with nested pages */}
        {filteredChapters.map((chapter) => {
          const chapterPages = getChapterPages(chapter.id).filter(filterDoc)
          const isExpanded = expandedChapters.has(chapter.id)

          return (
            <div key={chapter.id} className="mb-2">
              <div
                className="relative group"
                onMouseEnter={() => setHoveredDoc(chapter.id)}
                onMouseLeave={() => setHoveredDoc(null)}
              >
                <button
                  onClick={() => toggleChapter(chapter.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeDocId === chapter.id ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50"
                  }`}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  )}
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{chapter.title}</span>
                </button>

                {hoveredDoc === chapter.id && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditPage(chapter)
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeletePage(chapter.id)
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              {isExpanded && chapterPages.length > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  {chapterPages.map((page) => (
                    <div
                      key={page.id}
                      className="relative group"
                      onMouseEnter={() => setHoveredDoc(page.id)}
                      onMouseLeave={() => setHoveredDoc(null)}
                    >
                      <button
                        onClick={() => onDocSelect(page)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                          activeDocId === page.id
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <FileText className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate flex-1 text-left">{page.title}</span>
                      </button>

                      {hoveredDoc === page.id && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEditPage(page)
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeletePage(page.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Orphan pages (pages without a chapter) */}
        {filteredOrphans.length > 0 && (
          <div className="space-y-1 mt-2">
            {filteredOrphans.map((page) => (
              <div
                key={page.id}
                className="relative group"
                onMouseEnter={() => setHoveredDoc(page.id)}
                onMouseLeave={() => setHoveredDoc(null)}
              >
                <button
                  onClick={() => onDocSelect(page)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeDocId === page.id
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{page.title}</span>
                </button>

                {hoveredDoc === page.id && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditPage(page)
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeletePage(page.id)
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="p-4 border-t border-border/50">
        <Button variant="outline" className="w-full bg-transparent" size="sm">
          <Sparkles className="w-4 h-4 mr-2" />
          Generate from Code
        </Button>
      </div>
    </div>
  )
}
