"use client"

import { ExternalLink, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import ReactMarkdown from "react-markdown"
import type { Document } from "@/lib/types"

interface DocumentPreviewProps {
  document: Document
  onLinkToTask: () => void
}

export function DocumentPreview({ document, onLinkToTask }: DocumentPreviewProps) {
  const renderPreview = () => {
    if (document.type === "markdown" && document.content) {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{document.content}</ReactMarkdown>
        </div>
      )
    }

    if (document.type === "image" && document.url) {
      return (
        <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg">
          <img src={document.url || "/placeholder.svg"} alt={document.name} className="max-w-full h-auto rounded-lg" />
        </div>
      )
    }

    if (document.url) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground mb-4">Preview not available for this file type</p>
          <Button variant="outline" size="sm" asChild>
            <a href={document.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in External App
            </a>
          </Button>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center p-8 bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground">No preview available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{document.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {document.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">{renderPreview()}</div>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onLinkToTask}>
          <Link2 className="w-4 h-4 mr-2" />
          Link to Task
        </Button>
        {document.url && (
          <Button variant="outline" size="sm" asChild>
            <a href={document.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Editor
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
