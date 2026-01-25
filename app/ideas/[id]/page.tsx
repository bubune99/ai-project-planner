"use client"

import { useState, useEffect, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
  ChevronDown,
  Network,
  LayoutGrid,
  Share2,
  GitBranch,
  GitMerge,
  TrendingUp,
  Plus,
  Save,
} from "lucide-react"
import { toast } from "sonner"
import type { IdeaWithStats, ViewSettings, CanvasStats } from "@/lib/types"

// Import canvas components
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

  // Canvas state
  const [contextNotes, setContextNotes] = useState("")
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Dialog state
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

  // Fetch idea data
  useEffect(() => {
    const fetchIdea = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(`/api/ideas/${ideaId}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch idea: ${response.statusText}`)
        }

        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || "Failed to fetch idea")
        }

        setIdea(result.data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred"
        setError(errorMessage)
        toast.error("Failed to load idea", { description: errorMessage })
      } finally {
        setIsLoading(false)
      }
    }

    if (user && ideaId) {
      fetchIdea()
    }
  }, [user, ideaId])

  // Update canvas stats when idea data changes
  useEffect(() => {
    if (!idea) return

    const facets = idea.facets || []
    const facetCount = facets.length

    setCanvasStats({
      totalNodes: 1 + facetCount,
      nodesByType: {
        ideas: 1,
        facets: facetCount,
        validations: 0,
        content: 0,
      },
      totalConnections: facetCount,
      linkedIdeas: idea.linked_ideas || 0,
      activeLayers: 3,
      totalBranches: idea.branches_count || idea.branches?.length || 1,
      totalPerspectives: idea.perspectives || 1,
      totalScenarios: idea.scenarios || 1,
      perspectiveDetails: [],
    })
  }, [idea])

  const handleCanvasStatsChange = useCallback(
    (stats: {
      totalNodes: number
      nodesByType: { ideas: number; facets: number; validations: number; content: number }
      totalConnections: number
    }) => {
      setCanvasStats((prev) => ({
        ...prev,
        totalNodes: stats.totalNodes,
        nodesByType: stats.nodesByType,
        totalConnections: stats.totalConnections,
      }))
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
    } catch (err) {
      toast.error("Failed to promote idea")
    }
  }

  const handleAddFacet = () => {
    toast.info("Add facet feature coming soon")
  }

  const refetchIdea = useCallback(async () => {
    try {
      const response = await fetch(`/api/ideas/${ideaId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setIdea(result.data)
        }
      }
    } catch (err) {
      console.error("Failed to refetch idea:", err)
    }
  }, [ideaId])

  const handleSpawnSuccess = (childIdea: any) => {
    refetchIdea()
    if (childIdea?.id) {
      router.push(`/ideas/${childIdea.id}`)
    }
  }

  const handleMergeSuccess = () => {
    refetchIdea()
  }

  const handleEvolveSuccess = () => {
    refetchIdea()
  }

  // Loading state
  if (!user || isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Loading idea...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Error state
  if (error || !idea) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background">
          <div className="px-8 py-6">
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-2xl font-semibold mb-3">Failed to load idea</h3>
              <p className="text-muted-foreground mb-6 max-w-md">{error || "Idea not found"}</p>
              <div className="flex gap-3">
                <Link href="/ideas">
                  <Button variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Ideas
                  </Button>
                </Link>
                <Button onClick={() => window.location.reload()}>Try Again</Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const lifecycleState = idea.lifecycle || idea.idea_state || "seed"

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-4">
            <Link href="/ideas">
              <Button variant="ghost" size="sm" className="mb-3 -ml-2">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Ideas
              </Button>
            </Link>

            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <SimpleLifecycleBadge stage={lifecycleState} />
                  <span className="text-sm text-muted-foreground font-mono">{idea.id.slice(0, 8)}...</span>
                </div>
                <h1 className="text-3xl font-bold">{idea.title}</h1>
                {idea.description && (
                  <p className="text-muted-foreground max-w-2xl">{idea.description}</p>
                )}
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Created{" "}
                      {new Date(idea.createdAt || idea.created_at || "").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>
                      Updated{" "}
                      {new Date(idea.updatedAt || idea.updated_at || "").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleAddFacet}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Facet
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Promote <ChevronDown className="w-4 h-4 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => promoteIdea("exploring")}>
                        Promote to Exploring
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => promoteIdea("refined")}>
                        Promote to Refined
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => promoteIdea("promoted")}>
                        Promote to Execution
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => promoteIdea("archived")} className="text-destructive">
                        Archive Idea
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" onClick={() => setIsMergeDialogOpen(true)}>
                    <GitMerge className="h-4 w-4 mr-2" />
                    Merge
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsSpawnDialogOpen(true)}>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Branch
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEvolveDialogOpen(true)}>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Evolve
                  </Button>
                </div>

                {/* View controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <Button
                      variant={view === "canvas" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setView("canvas")}
                      className="h-8"
                    >
                      <Network className="w-4 h-4 mr-1" />
                      Canvas
                    </Button>
                    <Button
                      variant={view === "details" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setView("details")}
                      className="h-8"
                    >
                      <LayoutGrid className="w-4 h-4 mr-1" />
                      Details
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href)
                      toast.success("Link copied to clipboard")
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {view === "canvas" ? (
            <div className="space-y-6">
              <Card className="overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    Visualize your idea as an interactive graph. Drag nodes to reorganize, zoom to focus.
                  </p>
                </div>
                <div className="w-full h-[600px]">
                  <SimpleIdeaCanvas
                    viewSettings={viewSettings}
                    idea={idea}
                    onStatsChange={handleCanvasStatsChange}
                  />
                </div>
              </Card>

              <SimpleCanvasStats stats={canvasStats} />

              {/* Context Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Context Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add notes about this idea..."
                    value={contextNotes}
                    onChange={(e) => setContextNotes(e.target.value)}
                    className="min-h-[100px]"
                  />
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Details View */}
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {idea.description || idea.core_content || "No description provided."}
                  </p>
                </CardContent>
              </Card>

              {/* Facets */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Facets ({(idea.facets || []).length})</CardTitle>
                  <Button size="sm" onClick={handleAddFacet}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Facet
                  </Button>
                </CardHeader>
                <CardContent>
                  {(idea.facets || []).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No facets yet. Add facets to explore different aspects of your idea.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(idea.facets || []).map((facet) => (
                        <Card key={facet.id} className="bg-muted/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">
                              {facet.name || facet.facetType.replace(/_/g, " ")}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <pre className="text-xs text-muted-foreground overflow-auto max-h-32">
                              {typeof facet.data === "object"
                                ? JSON.stringify(facet.data, null, 2)
                                : String(facet.data || "")}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tags */}
              {idea.tags && idea.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {idea.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-sm rounded-full bg-primary/10 text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <SimpleCanvasStats stats={canvasStats} />
            </div>
          )}
        </div>
      </div>

      {/* Transformation Dialogs */}
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
        onSuccess={handleMergeSuccess}
      />
      <EvolvedIntoDialog
        open={isEvolveDialogOpen}
        onOpenChange={setIsEvolveDialogOpen}
        ideaId={ideaId}
        ideaTitle={idea.title}
        onSuccess={handleEvolveSuccess}
      />
    </DashboardLayout>
  )
}
