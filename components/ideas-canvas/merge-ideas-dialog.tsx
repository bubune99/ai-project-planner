"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, GitMerge, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  title: string
  lifecycle: string
  description: string | null
}

interface MergeIdeasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
  ideaTitle: string
  onSuccess?: () => void
}

export function MergeIdeasDialog({
  open,
  onOpenChange,
  ideaId,
  ideaTitle,
  onSuccess,
}: MergeIdeasDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedIdea, setSelectedIdea] = useState<SearchResult | null>(null)
  const [strategy, setStrategy] = useState<"keep-both" | "primary" | "secondary">("keep-both")
  const [archiveSource, setArchiveSource] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  useEffect(() => {
    const searchIdeas = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      try {
        const response = await fetch(
          `/api/ideas/search?q=${encodeURIComponent(searchQuery)}&exclude=${ideaId}`
        )
        const result = await response.json()

        if (result.success) {
          setSearchResults(result.data || [])
        }
      } catch (error) {
        console.error("Search failed:", error)
      } finally {
        setIsSearching(false)
      }
    }

    const debounce = setTimeout(searchIdeas, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, ideaId])

  const handleMerge = async () => {
    if (!selectedIdea) {
      toast.error("Please select an idea to merge with")
      return
    }

    setIsMerging(true)
    try {
      const response = await fetch(`/api/ideas/${ideaId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge",
          targetIdeaId: selectedIdea.id,
          strategy,
          archiveSource,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to merge ideas")
      }

      toast.success(`Ideas merged successfully${result.data.sourceArchived ? " (source archived)" : ""}`)
      onSuccess?.()
      handleClose()
    } catch (error) {
      console.error("Failed to merge:", error)
      toast.error(error instanceof Error ? error.message : "Failed to merge ideas")
    } finally {
      setIsMerging(false)
    }
  }

  const handleClose = () => {
    setSearchQuery("")
    setSearchResults([])
    setSelectedIdea(null)
    setStrategy("keep-both")
    setArchiveSource(true)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-purple-500" />
            Merge Ideas
          </DialogTitle>
          <DialogDescription>
            Merge &quot;{ideaTitle}&quot; into another idea. Choose a target idea and merge
            strategy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search */}
          <div className="space-y-2">
            <Label>Search for target idea</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ideas by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                disabled={isMerging}
              />
            </div>
          </div>

          {/* Search Results */}
          {(searchResults.length > 0 || isSearching) && (
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {isSearching ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Searching...</span>
                </div>
              ) : (
                searchResults.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => setSelectedIdea(idea)}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0",
                      selectedIdea?.id === idea.id && "bg-primary/10"
                    )}
                  >
                    <div className="font-medium text-sm">{idea.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {idea.lifecycle} · {idea.id.slice(0, 8)}...
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected Idea */}
          {selectedIdea && (
            <div className="p-3 bg-muted rounded-md">
              <div className="text-sm font-medium">Merging into:</div>
              <div className="text-sm text-muted-foreground">{selectedIdea.title}</div>
            </div>
          )}

          {/* Merge Strategy */}
          <div className="space-y-3">
            <Label>Merge Strategy</Label>
            <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keep-both" id="keep-both" disabled={isMerging} />
                <label htmlFor="keep-both" className="text-sm">
                  Keep both - Copy facets from source to target
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="primary" id="primary" disabled={isMerging} />
                <label htmlFor="primary" className="text-sm">
                  Primary wins - Keep only target&apos;s facets
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="secondary" id="secondary" disabled={isMerging} />
                <label htmlFor="secondary" className="text-sm">
                  Secondary wins - Replace with source&apos;s facets
                </label>
              </div>
            </RadioGroup>
          </div>

          {/* Archive Option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="archive-source"
              checked={archiveSource}
              onCheckedChange={(checked) => setArchiveSource(checked === true)}
              disabled={isMerging}
            />
            <label
              htmlFor="archive-source"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Archive source idea after merge
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isMerging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={isMerging || !selectedIdea}>
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4 mr-2" />
                Merge Ideas
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
