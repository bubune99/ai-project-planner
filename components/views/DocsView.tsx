"use client"

import { useState } from "react"
import { FileText, Plus } from "lucide-react"
import { DocsSidebar } from "./DocsSidebar"
import { DocsContent } from "./DocsContent"
import { DocsTOC } from "./DocsTOC"
import type { DocItem, DocSection } from "@/lib/types"
import { DocumentUploadModal } from "@/components/documents/DocumentUploadModal"
import { Button } from "@/components/ui/button"

interface DocsViewProps {
  sections?: DocSection[]
  projectId: string
  onRefresh?: () => void
}

export function DocsView({ sections, projectId, onRefresh }: DocsViewProps) {
  const docSections = Array.isArray(sections) && sections.length > 0 ? sections : []
  const firstDoc = docSections[0]?.items[0] || null
  const [activeDoc, setActiveDoc] = useState<DocItem | null>(firstDoc)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  const handleDocSelect = (doc: DocItem) => {
    setActiveDoc(doc)
  }

  const handleUploadSuccess = () => {
    if (onRefresh) {
      onRefresh()
    }
  }

  // Empty state
  if (docSections.length === 0 || !activeDoc) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <FileText className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">No documentation yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">Start by uploading documentation for your project</p>
          <Button onClick={() => setIsUploadModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        </div>

        <DocumentUploadModal
          projectId={projectId}
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <DocsSidebar sections={docSections} activeDocId={activeDoc.id} onDocSelect={handleDocSelect} />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1400px] mx-auto mb-6">
          <Button onClick={() => setIsUploadModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        </div>

        <div className="flex gap-8 max-w-[1400px] mx-auto">
          <DocsContent
            title={activeDoc.name}
            content={activeDoc.content}
            lastUpdated={activeDoc.lastUpdated}
            updatedBy={activeDoc.updatedBy}
          />
          <DocsTOC content={activeDoc.content} />
        </div>
      </div>

      <DocumentUploadModal
        projectId={projectId}
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  )
}
