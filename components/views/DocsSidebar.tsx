"use client"

import { useState } from "react"
import { Search, ChevronRight, ChevronDown, Plus, Edit, Trash, FolderPlus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChapterFormModal } from "@/components/docs/ChapterFormModal"
import { PageFormModal } from "@/components/docs/PageFormModal"

interface DocPage {
  id: string
  title: string
  slug: string
  icon: string
  order_index: number
  last_edited_by: string
  updated_at: string
}

interface DocChapter {
  id: string
  title: string
  description: string
  icon: string
  order_index: number
  is_expanded: boolean
  pages: DocPage[]
}

interface DocsSidebarProps {
  chapters: DocChapter[]
  activePageId: string | null
  onPageSelect: (pageId: string) => void
  onRefresh: () => void
  projectId: string
}

export function DocsSidebar({ chapters, activePageId, onPageSelect, onRefresh, projectId }: DocsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(chapters.filter((c) => c.is_expanded).map((c) => c.id)),
  )
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false)
  const [isPageModalOpen, setIsPageModalOpen] = useState(false)
  const [editingChapter, setEditingChapter] = useState<DocChapter | undefined>()
  const [selectedChapterId, setSelectedChapterId] = useState<string>("")

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

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm("Delete this chapter and all its pages?")) return

    try {
      await fetch(`/api/projects/${projectId}/doc-chapters/${chapterId}`, {
        method: "DELETE",
      })
      onRefresh()
    } catch (error) {
      console.error("[v0] Error deleting chapter:", error)
    }
  }

  const handleDeletePage = async (pageId: string) => {
    if (!confirm("Delete this page?")) return

    try {
      await fetch(`/api/projects/${projectId}/doc-pages/${pageId}`, {
        method: "DELETE",
      })
      onRefresh()
    } catch (error) {
      console.error("[v0] Error deleting page:", error)
    }
  }

  const filteredChapters = chapters
    .map((chapter) => ({
      ...chapter,
      pages: chapter.pages.filter((page) => page.title.toLowerCase().includes(searchQuery.toLowerCase())),
    }))
    .filter((chapter) => chapter.pages.length > 0 || !searchQuery)

  return (
    <div className="w-[280px] h-full border-r border-border/50 bg-card/30 backdrop-blur-md flex flex-col">
      <div className="p-4 border-b border-border/50 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-background/50"
          />
        </div>
        <Button
          onClick={() => {
            setEditingChapter(undefined)
            setIsChapterModalOpen(true)
          }}
          variant="outline"
          size="sm"
          className="w-full gap-2"
        >
          <FolderPlus className="w-4 h-4" />
          New Chapter
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filteredChapters.map((chapter) => (
          <div key={chapter.id} className="mb-2">
            <div className="flex items-center gap-1 group">
              <button
                onClick={() => toggleChapter(chapter.id)}
                className="flex-1 flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors"
              >
                {expandedChapters.has(chapter.id) ? (
                  <ChevronDown className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{chapter.icon}</span>
                <span className="truncate">{chapter.title}</span>
              </button>

              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setSelectedChapterId(chapter.id)
                    setIsPageModalOpen(true)
                  }}
                >
                  <Plus className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingChapter(chapter)
                    setIsChapterModalOpen(true)
                  }}
                >
                  <Edit className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteChapter(chapter.id)}>
                  <Trash className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {expandedChapters.has(chapter.id) && (
              <div className="ml-6 mt-1 space-y-1">
                {chapter.pages.map((page) => (
                  <div key={page.id} className="flex items-center gap-1 group">
                    <button
                      onClick={() => onPageSelect(page.id)}
                      className={`flex-1 flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        activePageId === page.id
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <span className="text-xs">{page.icon}</span>
                      <span className="truncate">{page.title}</span>
                    </button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => handleDeletePage(page.id)}
                    >
                      <Trash className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ChapterFormModal
        projectId={projectId}
        isOpen={isChapterModalOpen}
        onClose={() => {
          setIsChapterModalOpen(false)
          setEditingChapter(undefined)
        }}
        onSuccess={onRefresh}
        chapter={editingChapter}
      />

      <PageFormModal
        projectId={projectId}
        chapterId={selectedChapterId}
        isOpen={isPageModalOpen}
        onClose={() => setIsPageModalOpen(false)}
        onSuccess={onRefresh}
      />
    </div>
  )
}
