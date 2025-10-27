"use client"

import { useState } from "react"
import { Search, ChevronRight, ChevronDown, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { DocSection, DocItem } from "@/lib/types"

interface DocsSidebarProps {
  sections: DocSection[]
  activeDocId: string
  onDocSelect: (doc: DocItem) => void
}

export function DocsSidebar({ sections, activeDocId, onDocSelect }: DocsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.filter((s) => s.expanded).map((s) => s.id)),
  )

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())),
    }))
    .filter((section) => section.items.length > 0)

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
        {filteredSections.map((section) => (
          <div key={section.id} className="mb-2">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors"
            >
              {expandedSections.has(section.id) ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span>{section.icon}</span>
              <span>{section.name}</span>
            </button>

            {expandedSections.has(section.id) && (
              <div className="ml-6 mt-1 space-y-1">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onDocSelect(item)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      activeDocId === item.id
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <span className="text-xs">{item.icon}</span>
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
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
