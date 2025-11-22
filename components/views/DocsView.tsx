"use client"

import { useState, useEffect } from "react"
import { FileText, Plus } from "lucide-react"
import { DocsSidebar } from "./DocsSidebar"
import { DocsContent } from "./DocsContent"
import { DocsTOC } from "./DocsTOC"
import { Button } from "@/components/ui/button"
import { ChapterFormModal } from "@/components/docs/ChapterFormModal"

interface DocPage {
  id: string
  title: string
  slug: string
  icon: string
  content?: string
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

interface DocsViewProps {
  projectId: string
}

export function DocsView({ projectId }: DocsViewProps) {
  const [chapters, setChapters] = useState<DocChapter[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [activePageContent, setActivePageContent] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false)

  const loadChapters = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/doc-chapters`)
      const data = await response.json()
      setChapters(data.chapters || [])

      if (data.chapters?.length > 0 && data.chapters[0].pages?.length > 0) {
        const firstPage = data.chapters[0].pages[0]
        setActivePageId(firstPage.id)
        loadPageContent(firstPage.id)
      }
    } catch (error) {
      console.error("[v0] Error loading chapters:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPageContent = async (pageId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/doc-pages/${pageId}`)
      const data = await response.json()
      setActivePageContent(data.page?.content || "")
    } catch (error) {
      console.error("[v0] Error loading page content:", error)
    }
  }

  useEffect(() => {
    loadChapters()
  }, [projectId])

  const handlePageSelect = (pageId: string) => {
    setActivePageId(pageId)
    loadPageContent(pageId)
  }

  const activePage = chapters.flatMap((c) => c.pages).find((p) => p.id === activePageId)

  if (isLoading) {
    return <div className="flex h-full items-center justify-center">Loading...</div>
  }

  if (chapters.length === 0) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <FileText className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">No documentation yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Start by creating your first chapter to organize your project documentation
          </p>
          <Button onClick={() => setIsChapterModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Chapter
          </Button>
        </div>

        <ChapterFormModal
          projectId={projectId}
          isOpen={isChapterModalOpen}
          onClose={() => setIsChapterModalOpen(false)}
          onSuccess={loadChapters}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <DocsSidebar
        chapters={chapters}
        activePageId={activePageId}
        onPageSelect={handlePageSelect}
        onRefresh={loadChapters}
        projectId={projectId}
      />

      <div className="flex-1 overflow-y-auto">
        {activePage ? (
          <div className="flex gap-8 max-w-[1400px] mx-auto p-8">
            <DocsContent
              title={activePage.title}
              content={activePageContent}
              lastUpdated={activePage.updated_at}
              updatedBy={activePage.last_edited_by}
            />
            <DocsTOC content={activePageContent} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">Select a page to view</div>
        )}
      </div>
    </div>
  )
}
