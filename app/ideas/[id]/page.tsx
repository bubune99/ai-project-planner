"use client"

import { useState, useEffect, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { toast } from "sonner"
import type { IdeaWithStats, ViewSettings, CanvasStats } from "@/lib/types"

import { SimpleIdeaCanvas } from "@/components/ideas-canvas/simple-idea-canvas"
import { SimpleLifecycleBadge } from "@/components/ideas-canvas/simple-lifecycle-badge"
import { SimpleCanvasStats } from "@/components/ideas-canvas/simple-canvas-stats"
import { SpawnChildDialog } from "@/components/ideas-canvas/spawn-child-dialog"
import { MergeIdeasDialog } from "@/components/ideas-canvas/merge-ideas-dialog"
import { EvolvedIntoDialog } from "@/components/ideas-canvas/evolved-into-dialog"

export default function IdeaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = use(params)
  const router = useRouter()
  const user = useUser()

  const [idea, setIdea] = useState<IdeaWithStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<"canvas" | "details">("canvas")
  const [contextNotes, setContextNotes] = useState("")

  const [isSpawnDialogOpen, setIsSpawnDialogOpen] = useState(false)
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false)
  const [isEvolveDialogOpen, setIsEvolveDialogOpen] = useState(false)

  const [viewSettings] = useState<ViewSettings>({
    showBranches: true,
    showPerspectives: true,
    showScenarios: true,
    showLayers: true,
    showMinimap: true,
    showControls: true,
    showContextNotes: true,
  })

  const [canvasStats, setCanvasStats] = useState<CanvasStats>({
    totalNodes: 0,
    nodesByType: { ideas: 0, facets: 0, validations: 0, content: 0 },
    totalConnections: 0,
    linkedIdeas: 0,
    activeLayers: 3,
    totalBranches: 1,
    totalPerspectives: 1,
    totalScenarios: 1,
    perspectiveDetails: [],
  })

  useEffect(() => {
    const fetchIdea = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch(`/api/ideas/${ideaId}`)
        if (!response.ok) throw new Error(`Failed to fetch idea: ${response.statusText}`)
        const result = await response.json()
        if (!result.success) throw new Error(result.error || "Failed to fetch idea")
        setIdea(result.data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        setError(msg)
        toast.error("Failed to load idea", { description: msg })
      } finally {
        setIsLoading(false)
      }
    }
    if (user && ideaId) fetchIdea()
  }, [user, ideaId])

  useEffect(() => {
    if (!idea) return
    const facets = idea.facets || []
    setCanvasStats({
      totalNodes: 1 + facets.length,
      nodesByType: { ideas: 1, facets: facets.length, validations: 0, content: 0 },
      totalConnections: facets.length,
      linkedIdeas: idea.linked_ideas || 0,
      activeLayers: 3,
      totalBranches: idea.branches_count || idea.branches?.length || 1,
      totalPerspectives: idea.perspectives || 1,
      totalScenarios: idea.scenarios || 1,
      perspectiveDetails: [],
    })
  }, [idea])

  const handleCanvasStatsChange = useCallback(
    (stats: { totalNodes: number; nodesByType: { ideas: number; facets: number; validations: number; content: number }; totalConnections: number }) => {
      setCanvasStats(prev => ({ ...prev, ...stats }))
    },
    []
  )

  const promoteIdea = async (targetState: string) => {
    try {
      const response = await fetch(`/api/ideas/${ideaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: targetState }),
      })
      if (!response.ok) throw new Error("Failed to update idea")
      const result = await response.json()
      if (result.success) {
        setIdea(result.data)
        toast.success(`Idea promoted to ${targetState}`)
      }
    } catch {
      toast.error("Failed to promote idea")
    }
  }

  const refetchIdea = useCallback(async () => {
    try {
      const response = await fetch(`/api/ideas/${ideaId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) setIdea(result.data)
      }
    } catch (err) {
      console.error("Failed to refetch idea:", err)
    }
  }, [ideaId])

  const handleSpawnSuccess = (childIdea: { id?: string }) => {
    refetchIdea()
    if (childIdea?.id) router.push(`/ideas/${childIdea.id}`)
  }

  if (!user || isLoading) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !idea) {
    return (
      <DashboardLayout>
        <div className="j-content" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "oklch(0.545 0.199 27 / 0.15)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 28 }}>⚠</div>
          <h3 style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Failed to load idea</h3>
          <p className="j-muted" style={{ marginBottom: 20 }}>{error || "Idea not found"}</p>
          <div className="j-row" style={{ justifyContent: "center", gap: 10 }}>
            <Link href="/ideas"><button className="j-btn j-btn-ghost">← Back to Ideas</button></Link>
            <button className="j-btn j-btn-primary" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const lifecycleState = idea.lifecycle || idea.idea_state || "seed"

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* Header */}
        <div>
          <Link href="/ideas">
            <button className="j-btn j-btn-ghost" style={{ marginBottom: 12, fontSize: 12 }}>← Ideas</button>
          </Link>

          <div className="j-row j-between" style={{ alignItems: "flex-start" }}>
            <div className="j-col" style={{ gap: 6, flex: 1, minWidth: 0 }}>
              <div className="j-row" style={{ gap: 8 }}>
                <SimpleLifecycleBadge stage={lifecycleState} />
                <span className="j-muted j-num" style={{ fontSize: 11 }}>{idea.id.slice(0, 8)}…</span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0, letterSpacing: "-0.02em" }}>{idea.title}</h1>
              {idea.description && (
                <p className="j-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5, maxWidth: 600 }}>{idea.description}</p>
              )}
              <div className="j-row j-gap-3" style={{ gap: 16 }}>
                {idea.createdAt || idea.created_at ? (
                  <span className="j-muted" style={{ fontSize: 11 }}>
                    Created {new Date(idea.createdAt || idea.created_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                ) : null}
                {idea.updatedAt || idea.updated_at ? (
                  <span className="j-muted" style={{ fontSize: 11 }}>
                    Updated {new Date(idea.updatedAt || idea.updated_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Action bar */}
            <div className="j-col" style={{ gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
              <div className="j-row j-gap-2">
                <button className="j-btn j-btn-ghost" onClick={() => toast.info("Add facet feature coming soon")}>+ Facet</button>
                <select
                  style={{ background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "6px 10px", color: "oklch(0.860 0 0)", fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none" }}
                  onChange={(e) => { if (e.target.value) promoteIdea(e.target.value) }}
                  value=""
                >
                  <option value="">Promote…</option>
                  <option value="exploring">Exploring</option>
                  <option value="refined">Refined</option>
                  <option value="promoted">Execution</option>
                  <option value="archived">Archive</option>
                </select>
                <button className="j-btn j-btn-ghost" onClick={() => setIsMergeDialogOpen(true)}>⇌ Merge</button>
                <button className="j-btn j-btn-ghost" onClick={() => setIsSpawnDialogOpen(true)}>⎇ Branch</button>
                <button className="j-btn j-btn-ghost" onClick={() => setIsEvolveDialogOpen(true)}>↑ Evolve</button>
                <button
                  className="j-btn j-btn-ghost"
                  style={{ padding: "6px 10px" }}
                  onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied") }}
                >
                  ⎘
                </button>
              </div>
              <div className="j-row j-gap-2">
                {(["canvas","details"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`j-pill ${view === v ? "j-proj" : "j-ghost"}`}
                    style={{ cursor: "pointer", border: "none", textTransform: "capitalize" }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas view */}
        {view === "canvas" && (
          <>
            <div className="j-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--j-hairline)" }}>
                <p className="j-muted" style={{ fontSize: 12, margin: 0 }}>
                  Visualize your idea as an interactive graph. Drag nodes to reorganize, zoom to focus.
                </p>
              </div>
              <div style={{ width: "100%", height: 600 }}>
                <SimpleIdeaCanvas
                  viewSettings={viewSettings}
                  idea={idea}
                  onStatsChange={handleCanvasStatsChange}
                />
              </div>
            </div>

            <SimpleCanvasStats stats={canvasStats} />

            <div className="j-card">
              <div className="j-card-head">
                <p className="j-card-title">Context notes</p>
              </div>
              <textarea
                placeholder="Add notes about this idea..."
                value={contextNotes}
                onChange={(e) => setContextNotes(e.target.value)}
                style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "vertical", fontSize: 13, lineHeight: 1.5, minHeight: 80, color: "oklch(0.860 0 0)", fontFamily: "inherit" }}
              />
            </div>
          </>
        )}

        {/* Details view */}
        {view === "details" && (
          <>
            <div className="j-card">
              <div className="j-card-head">
                <p className="j-card-title">Description</p>
              </div>
              <p className="j-muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                {idea.description || (idea as { core_content?: string }).core_content || "No description provided."}
              </p>
            </div>

            <div className="j-card">
              <div className="j-card-head">
                <p className="j-card-title">Facets ({(idea.facets || []).length})</p>
                <button className="j-btn j-btn-primary" style={{ fontSize: 12 }} onClick={() => toast.info("Add facet feature coming soon")}>+ Add facet</button>
              </div>
              {(idea.facets || []).length === 0 ? (
                <p className="j-muted" style={{ textAlign: "center", padding: 32, fontSize: 13 }}>
                  No facets yet. Add facets to explore different aspects of your idea.
                </p>
              ) : (
                <div className="j-grid j-cols-2">
                  {(idea.facets || []).map(facet => (
                    <div key={facet.id} className="j-card" style={{ background: "oklch(1 0 0 / 0.03)" }}>
                      <div className="j-eyebrow" style={{ marginBottom: 6 }}>
                        {facet.name || facet.facetType.replace(/_/g, " ")}
                      </div>
                      <pre style={{ fontSize: 11, color: "var(--j-muted)", overflow: "auto", maxHeight: 128, margin: 0 }}>
                        {typeof facet.data === "object" ? JSON.stringify(facet.data, null, 2) : String(facet.data || "")}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {idea.tags && idea.tags.length > 0 && (
              <div className="j-card">
                <div className="j-card-head">
                  <p className="j-card-title">Tags</p>
                </div>
                <div className="j-row j-wrap" style={{ gap: 6 }}>
                  {idea.tags.map((tag, i) => (
                    <span key={i} className="j-pill j-idea">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <SimpleCanvasStats stats={canvasStats} />
          </>
        )}
      </div>

      <SpawnChildDialog
        open={isSpawnDialogOpen}
        onOpenChange={setIsSpawnDialogOpen}
        ideaId={ideaId}
        ideaTitle={idea.title}
        onSuccess={handleSpawnSuccess}
      />
      <MergeIdeasDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        ideaId={ideaId}
        ideaTitle={idea.title}
        onSuccess={refetchIdea}
      />
      <EvolvedIntoDialog
        open={isEvolveDialogOpen}
        onOpenChange={setIsEvolveDialogOpen}
        ideaId={ideaId}
        ideaTitle={idea.title}
        onSuccess={refetchIdea}
      />
    </DashboardLayout>
  )
}
