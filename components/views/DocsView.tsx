"use client"

import { useState } from "react"
import { FileText } from "lucide-react"
import { DocsSidebar } from "./DocsSidebar"
import { DocsContent } from "./DocsContent"
import { DocsTOC } from "./DocsTOC"
import { mockDocsData } from "@/lib/mock-data"
import type { DocItem } from "@/lib/types"

export function DocsView() {
  const [activeDoc, setActiveDoc] = useState<DocItem>(mockDocsData[1].items[0]) // System Design doc

  const handleDocSelect = (doc: DocItem) => {
    setActiveDoc(doc)
  }

  // Empty state
  if (!activeDoc.content) {
    return (
      <div className="flex h-full">
        <DocsSidebar sections={mockDocsData} activeDocId={activeDoc.id} onDocSelect={handleDocSelect} />
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <FileText className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">No documentation yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Start by creating a README.md or generating docs from your code
          </p>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
            Create First Doc
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <DocsSidebar sections={mockDocsData} activeDocId={activeDoc.id} onDocSelect={handleDocSelect} />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex gap-8 max-w-[1400px] mx-auto">
          <DocsContent title={activeDoc.name} content={activeDoc.content} />
          <DocsTOC content={activeDoc.content} />
        </div>
      </div>
    </div>
  )
}
