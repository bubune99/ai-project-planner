"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { IdeaList } from "@/components/ideas"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import type { Idea, IdeaLifecycle, IdeaLifecycleCounts } from "@/lib/types"

export default function IdeasPage() {
  const router = useRouter()
  const user = useUser()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [counts, setCounts] = useState<IdeaLifecycleCounts | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLifecycle, setSelectedLifecycle] = useState<IdeaLifecycle | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

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
      if (!res.ok) throw new Error("Failed to fetch ideas")
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
      if (!res.ok) throw new Error("Failed to create idea")
      setIsCreateOpen(false)
      setNewIdea({ title: "", description: "", category: "", tags: "" })
      fetchIdeas()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this idea?")) return
    try {
      const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete idea")
      fetchIdeas()
    } catch (err) {
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
      if (!res.ok) throw new Error("Failed to update idea")
      fetchIdeas()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    }
  }

  const handleIdeaClick = (idea: Idea) => {
    router.push(`/ideas/${idea.id}`)
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : ideas.length
  const hotCount = counts?.exploring ?? 0

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* Header strip */}
        <div className="j-row j-between">
          <div className="j-row j-gap-2">
            <span className="j-pill j-idea" style={{ fontSize: 12 }}>💡 {total} ideas</span>
            {hotCount > 0 && <span className="j-pill j-warn">{hotCount} exploring</span>}
          </div>
          <button className="j-btn j-btn-primary" onClick={() => setIsCreateOpen(true)}>+ New idea</button>
        </div>

        {/* Error */}
        {error && (
          <div className="j-card" style={{ textAlign: "center", padding: 24 }}>
            <p style={{ color: "var(--j-neg)", marginBottom: 12 }}>{error}</p>
            <button className="j-btn j-btn-ghost" onClick={fetchIdeas}>Try again</button>
          </div>
        )}

        {/* Idea list */}
        {!error && (
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

      {/* Create idea dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-black/95 border-white/10 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-white">New idea</DialogTitle>
            <DialogDescription className="text-gray-400">
              Capture a new idea. You can add more details and facets later.
            </DialogDescription>
          </DialogHeader>
          <div className="j-col j-gap-3" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <div className="j-col" style={{ gap: 6 }}>
              <Label htmlFor="title" className="text-white" style={{ fontSize: 12 }}>Title *</Label>
              <input
                id="title"
                placeholder="What's your idea?"
                style={{ width: "100%", background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "8px 12px", color: "oklch(0.860 0 0)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                value={newIdea.title}
                onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
              />
            </div>
            <div className="j-col" style={{ gap: 6 }}>
              <Label htmlFor="description" className="text-white" style={{ fontSize: 12 }}>Description</Label>
              <textarea
                id="description"
                placeholder="Describe your idea in more detail..."
                rows={4}
                style={{ width: "100%", background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "8px 12px", color: "oklch(0.860 0 0)", fontSize: 13, resize: "vertical", fontFamily: "inherit", outline: "none" }}
                value={newIdea.description}
                onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
              />
            </div>
            <div className="j-grid j-cols-2">
              <div className="j-col" style={{ gap: 6 }}>
                <Label htmlFor="category" className="text-white" style={{ fontSize: 12 }}>Category</Label>
                <select
                  id="category"
                  style={{ background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "8px 12px", color: "oklch(0.860 0 0)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                  value={newIdea.category}
                  onChange={(e) => setNewIdea({ ...newIdea, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  <option value="product">Product</option>
                  <option value="feature">Feature</option>
                  <option value="improvement">Improvement</option>
                  <option value="research">Research</option>
                  <option value="business">Business</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="j-col" style={{ gap: 6 }}>
                <Label htmlFor="tags" className="text-white" style={{ fontSize: 12 }}>Tags</Label>
                <input
                  id="tags"
                  placeholder="tag1, tag2, tag3"
                  style={{ width: "100%", background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "8px 12px", color: "oklch(0.860 0 0)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                  value={newIdea.tags}
                  onChange={(e) => setNewIdea({ ...newIdea, tags: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button className="j-btn j-btn-ghost" onClick={() => setIsCreateOpen(false)}>Cancel</button>
            <button
              className="j-btn j-btn-primary"
              onClick={handleCreate}
              disabled={!newIdea.title.trim() || isCreating}
              style={{ opacity: (!newIdea.title.trim() || isCreating) ? 0.5 : 1 }}
            >
              {isCreating ? "Creating…" : "+ Create idea"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
