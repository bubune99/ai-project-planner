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
import { Textarea } from "@/components/ui/textarea"
import { Loader2, TrendingUp, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  title: string
  lifecycle: string
  description: string | null
}

interface EvolvedIntoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
  ideaTitle: string
  onSuccess?: () => void
}

export function EvolvedIntoDialog({
  open,
  onOpenChange,
  ideaId,
  ideaTitle,
  onSuccess,
}: EvolvedIntoDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedIdea, setSelectedIdea] = useState<SearchResult | null>(null)
  const [notes, setNotes] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

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

  const handleLink = async () => {
    if (!selectedIdea) {
      toast.error("Please select an idea")
      return
    }

    setIsLinking(true)
    try {
      const response = await fetch(`/api/ideas/${ideaId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evolved-into",
          targetIdeaId: selectedIdea.id,
          notes: notes.trim() || undefined,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to link evolution")
      }

      toast.success("Evolution link created successfully")
      onSuccess?.()
      handleClose()
    } catch (error) {
      console.error("Failed to link evolution:", error)
      toast.error(error instanceof Error ? error.message : "Failed to link evolution")
    } finally {
      setIsLinking(false)
    }
  }

  const handleClose = () => {
    setSearchQuery("")
    setSearchResults([])
    setSelectedIdea(null)
    setNotes("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Mark Evolution
          </DialogTitle>
          <DialogDescription>
            Link &quot;{ideaTitle}&quot; as having evolved into another idea. This creates a
            historical record of how ideas develop over time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search */}
          <div className="space-y-2">
            <Label>Search for the evolved idea</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ideas by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                disabled={isLinking}
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
              <div className="text-sm font-medium">Evolved into:</div>
              <div className="text-sm text-muted-foreground">{selectedIdea.title}</div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="evolution-notes">Notes (optional)</Label>
            <Textarea
              id="evolution-notes"
              placeholder="Describe how this idea evolved..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLinking}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLinking}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={isLinking || !selectedIdea}>
            {isLinking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4 mr-2" />
                Mark Evolution
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
