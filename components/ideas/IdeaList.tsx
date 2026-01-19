"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles,
  Compass,
  CheckCircle2,
  Rocket,
  Archive,
  Search,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { IdeaCard } from "./IdeaCard"
import type { Idea, IdeaLifecycle, IdeaLifecycleCounts } from "@/lib/types"
import { useState } from "react"

interface IdeaListProps {
  ideas: Idea[]
  counts?: IdeaLifecycleCounts
  isLoading?: boolean
  selectedLifecycle?: IdeaLifecycle | null
  onLifecycleChange?: (lifecycle: IdeaLifecycle | null) => void
  onSearch?: (query: string) => void
  onIdeaClick?: (idea: Idea) => void
  onEdit?: (idea: Idea) => void
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
  onPromote?: (idea: Idea) => void
  onCreate?: () => void
}

const lifecycleFilters: { value: IdeaLifecycle | null; label: string; icon: typeof Sparkles; color: string }[] = [
  { value: null, label: "All", icon: LayoutGrid, color: "text-gray-400" },
  { value: "seed", label: "Seeds", icon: Sparkles, color: "text-yellow-400" },
  { value: "exploring", label: "Exploring", icon: Compass, color: "text-blue-400" },
  { value: "refined", label: "Refined", icon: CheckCircle2, color: "text-green-400" },
  { value: "promoted", label: "Promoted", icon: Rocket, color: "text-purple-400" },
  { value: "archived", label: "Archived", icon: Archive, color: "text-gray-400" },
]

export function IdeaList({
  ideas,
  counts,
  isLoading,
  selectedLifecycle,
  onLifecycleChange,
  onSearch,
  onIdeaClick,
  onEdit,
  onDelete,
  onArchive,
  onPromote,
  onCreate,
}: IdeaListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    onSearch?.(query)
  }

  const getCount = (lifecycle: IdeaLifecycle | null): number => {
    if (!counts) return 0
    if (lifecycle === null) {
      return counts.seed + counts.exploring + counts.refined + counts.promoted
    }
    return counts[lifecycle] || 0
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Filter skeleton */}
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 w-24 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Grid skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="border-white/10 bg-black/40 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Lifecycle Filters */}
        <div className="flex flex-wrap gap-2 flex-1">
          {lifecycleFilters.map((filter) => {
            const Icon = filter.icon
            const isSelected = selectedLifecycle === filter.value
            const count = getCount(filter.value)

            return (
              <Button
                key={filter.value || "all"}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                className={cn(
                  "border-white/10",
                  isSelected
                    ? "bg-white/10 text-white"
                    : "bg-transparent hover:bg-white/5"
                )}
                onClick={() => onLifecycleChange?.(filter.value)}
              >
                <Icon className={cn("h-4 w-4 mr-2", filter.color)} />
                {filter.label}
                {counts && (
                  <Badge variant="outline" className="ml-2 text-xs border-white/10">
                    {count}
                  </Badge>
                )}
              </Button>
            )
          })}
        </div>

        {/* Search & View Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search ideas..."
              className="pl-9 w-64 bg-black/40 border-white/10"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center border border-white/10 rounded-lg">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 rounded-r-none", viewMode === "grid" && "bg-white/10")}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 rounded-l-none", viewMode === "list" && "bg-white/10")}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Ideas Grid/List */}
      {ideas.length === 0 ? (
        <Card className="border-white/10 bg-black/40">
          <CardContent className="pt-6">
            <div className="text-center py-12 text-gray-400">
              {searchQuery ? (
                <>
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-2">No ideas found matching "{searchQuery}"</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </>
              ) : selectedLifecycle ? (
                <>
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-2">No {selectedLifecycle} ideas yet</p>
                  <p className="text-sm">Ideas in this stage will appear here</p>
                </>
              ) : (
                <>
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-4">No ideas yet. Start capturing your thoughts!</p>
                  {onCreate && (
                    <Button onClick={onCreate} className="bg-yellow-500 hover:bg-yellow-600 text-black">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Idea
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={cn(
          viewMode === "grid"
            ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            : "space-y-3"
        )}>
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onClick={onIdeaClick}
              onEdit={onEdit}
              onDelete={onDelete}
              onArchive={onArchive}
              onPromote={onPromote}
            />
          ))}
        </div>
      )}
    </div>
  )
}
