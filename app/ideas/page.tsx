"use client"

import { useState, useEffect, useCallback } from "react"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { IdeaList } from "@/components/ideas"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Loader2, RefreshCw, Lightbulb } from "lucide-react"
import type { Idea, IdeaLifecycle, IdeaLifecycleCounts } from "@/lib/types"

export default function IdeasPage() {
  const user = useUser()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [counts, setCounts] = useState<IdeaLifecycleCounts | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLifecycle, setSelectedLifecycle] = useState<IdeaLifecycle | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Create dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newIdea, setNewIdea] = useState({
    title: "",
    description: "",
    category: "",
    tags: "",
  })

  const fetchIdeas = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (selectedLifecycle) params.set("lifecycle", selectedLifecycle)
      if (searchQuery) params.set("search", searchQuery)

      const res = await fetch(`/api/ideas?${params.toString()}`)
      if (!res.ok) {
        throw new Error("Failed to fetch ideas")
      }

      const data = await res.json()
      setIdeas(data.data || [])
      if (data.meta?.counts) {
        setCounts({
          seed: data.meta.counts.seed || 0,
          exploring: data.meta.counts.exploring || 0,
          refined: data.meta.counts.refined || 0,
          promoted: data.meta.counts.promoted || 0,
          archived: data.meta.counts.archived || 0,
        })
      }
    } catch (err) {
      console.error("Failed to fetch ideas:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [selectedLifecycle, searchQuery])

  useEffect(() => {
    if (user) {
      fetchIdeas()
    }
  }, [user, fetchIdeas])

  const handleCreate = async () => {
    if (!newIdea.title.trim()) return

    try {
      setIsCreating(true)
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newIdea.title.trim(),
          description: newIdea.description.trim() || null,
          category: newIdea.category.trim() || null,
          tags: newIdea.tags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to create idea")
      }

      setIsCreateOpen(false)
      setNewIdea({ title: "", description: "", category: "", tags: "" })
      fetchIdeas()
    } catch (err) {
      console.error("Failed to create idea:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this idea?")) return

    try {
      const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" })
      if (!res.ok) {
        throw new Error("Failed to delete idea")
      }
      fetchIdeas()
    } catch (err) {
      console.error("Failed to delete idea:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    }
  }

  const handleArchive = async (id: string) => {
    try {
      const idea = ideas.find(i => i.id === id)
      const newLifecycle = idea?.lifecycle === "archived" ? "seed" : "archived"

      const res = await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: newLifecycle }),
      })
      if (!res.ok) {
        throw new Error("Failed to update idea")
      }
      fetchIdeas()
    } catch (err) {
      console.error("Failed to archive idea:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    }
  }

  const handleIdeaClick = (idea: Idea) => {
    // TODO: Navigate to idea detail/canvas view
    console.log("Open idea:", idea.id)
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Ideas Canvas</h1>
                <p className="text-muted-foreground">Capture, evolve, and validate your ideas</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchIdeas}
                  disabled={isLoading}
                  className="border-white/10 hover:bg-white/5"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  className="bg-yellow-500 hover:bg-yellow-600 text-black gap-2"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  New Idea
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          {error ? (
            <Card className="border-white/10 bg-black/40">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button onClick={fetchIdeas} variant="outline">
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <IdeaList
              ideas={ideas}
              counts={counts}
              isLoading={isLoading}
              selectedLifecycle={selectedLifecycle}
              onLifecycleChange={setSelectedLifecycle}
              onSearch={setSearchQuery}
              onIdeaClick={handleIdeaClick}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onCreate={() => setIsCreateOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Create Idea Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-black/95 border-white/10 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Lightbulb className="h-5 w-5 text-yellow-400" />
              New Idea
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Capture a new idea. You can add more details and facets later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-white">Title *</Label>
              <Input
                id="title"
                placeholder="What's your idea?"
                className="bg-black/40 border-white/10"
                value={newIdea.title}
                onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-white">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your idea in more detail..."
                className="bg-black/40 border-white/10 min-h-[100px]"
                value={newIdea.description}
                onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-white">Category</Label>
                <Select
                  value={newIdea.category}
                  onValueChange={(value) => setNewIdea({ ...newIdea, category: value })}
                >
                  <SelectTrigger className="bg-black/40 border-white/10">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/95 border-white/10">
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="improvement">Improvement</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags" className="text-white">Tags</Label>
                <Input
                  id="tags"
                  placeholder="tag1, tag2, tag3"
                  className="bg-black/40 border-white/10"
                  value={newIdea.tags}
                  onChange={(e) => setNewIdea({ ...newIdea, tags: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              className="border-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newIdea.title.trim() || isCreating}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Idea
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
