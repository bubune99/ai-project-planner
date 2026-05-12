"use client"

import { useState, useEffect } from "react"
import { FileText, Plus } from "lucide-react"
import { DocsSidebar } from "./DocsSidebar"
import { DocsContent } from "./DocsContent"
import { DocsTOC } from "./DocsTOC"
import { Button } from "@/components/ui/button"
import { PageFormModal } from "@/components/docs/PageFormModal"

interface Document {
  id: string
  title: string
  description?: string
  content?: string
  doc_type: "chapter" | "page"
  parent_id?: string
  updated_at: string
  last_edited_by?: string
}

interface DocsViewProps {
  projectId: string
}

export function DocsView({ projectId }: DocsViewProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [chapters, setChapters] = useState<Document[]>([])
  const [activeDoc, setActiveDoc] = useState<Document | null>(null)
  const [isPageModalOpen, setIsPageModalOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Document | undefined>()
  const [isLoading, setIsLoading] = useState(true)

  const fetchDocuments = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/projects/${projectId}/documents`)
      if (!res.ok) throw new Error("Failed to fetch documents")
      const data = await res.json()
      const docs: Document[] = data.documents || []
      setDocuments(docs)
      setChapters(docs.filter(d => d.doc_type === "chapter"))
      if (!activeDoc) {
        const firstPage = docs.find(d => d.doc_type === "page")
        if (firstPage) setActiveDoc(firstPage)
      }
    } catch (error) {
      console.error("[DocsView] Failed to fetch documents:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [projectId])

  const handleDocSelect = (doc: Document) => {
    setActiveDoc(doc)
  }

  const handleCreatePage = () => {
    setEditingDoc(undefined)
    setIsPageModalOpen(true)
  }

  const handleEditPage = (doc: Document) => {
    setEditingDoc(doc)
    setIsPageModalOpen(true)
  }

  const handleDeletePage = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this page?")) return

    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete page")

      // If we deleted the active doc, clear it
      if (activeDoc?.id === docId) {
        setActiveDoc(null)
      }

      fetchDocuments()
    } catch (error) {
      console.error("Error deleting page:", error)
      alert("Failed to delete page")
    }
  }

  const handleModalSuccess = () => {
    fetchDocuments()
  }

  // Empty state
  if (!isLoading && documents.length === 0) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <FileText className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">No documentation yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">Start by creating your first chapter or page</p>
          <Button onClick={handleCreatePage} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Page
          </Button>
        </div>

        <PageFormModal
          projectId={projectId}
          isOpen={isPageModalOpen}
          onClose={() => setIsPageModalOpen(false)}
          onSuccess={handleModalSuccess}
          editPage={editingDoc}
          chapters={chapters}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <DocsSidebar
        documents={documents}
        activeDocId={activeDoc?.id || ""}
        onDocSelect={handleDocSelect}
        onEditPage={handleEditPage}
        onDeletePage={handleDeletePage}
        onCreatePage={handleCreatePage}
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1400px] mx-auto mb-6">
          <Button onClick={handleCreatePage} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Page
          </Button>
        </div>

        {activeDoc ? (
          <div className="flex gap-8 max-w-[1400px] mx-auto">
            <DocsContent
              title={activeDoc.title}
              content={activeDoc.content || "No content yet. This will be editable with a text editor."}
              lastUpdated={activeDoc.updated_at}
              updatedBy={activeDoc.last_edited_by}
            />
            <DocsTOC content={activeDoc.content || ""} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a page from the sidebar
          </div>
        )}
      </div>

      <PageFormModal
        projectId={projectId}
        isOpen={isPageModalOpen}
        onClose={() => setIsPageModalOpen(false)}
        onSuccess={handleModalSuccess}
        editPage={editingDoc}
        chapters={chapters}
      />
    </div>
  )
}
