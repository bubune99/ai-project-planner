"use client"

import { FileText, FileImage, File, Link2, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Document } from "@/lib/types"

const fileIcons = {
  markdown: FileText,
  word: File,
  figma: Link2,
  pdf: File,
  image: FileImage,
}

const fileColors = {
  markdown: "text-blue-500",
  word: "text-blue-600",
  figma: "text-purple-500",
  pdf: "text-red-500",
  image: "text-green-500",
}

interface DocumentCardProps {
  document: Document
  onClick: () => void
  onTagClick: (tag: string) => void
}

export function DocumentCard({ document, onClick, onTagClick }: DocumentCardProps) {
  const Icon = fileIcons[document.type]
  const iconColor = fileColors[document.type]

  const timeAgo = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return "Just now"
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`
    return date.toLocaleDateString()
  }

  return (
    <div
      className="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate">{document.name}</h4>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {document.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick(tag)
                }}
              >
                #{tag}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(document.lastModified)}
            </div>
            {document.linkedTasks.length > 0 && (
              <div className="flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                Used in {document.linkedTasks.length} task{document.linkedTasks.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
