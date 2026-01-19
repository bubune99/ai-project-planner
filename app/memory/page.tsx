"use client"

import { useState, useEffect } from "react"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { MemoryLayerCard, MemoryLayerSkeleton } from "@/components/memory"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Brain,
  RefreshCw,
  Loader2,
  Settings,
  Database,
  Zap,
} from "lucide-react"
import type { MemoryOverview } from "@/lib/types"

export default function MemoryPage() {
  const user = useUser()
  const [overview, setOverview] = useState<MemoryOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchOverview()
    }
  }, [user])

  const fetchOverview = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const res = await fetch("/api/memory")
      if (!res.ok) {
        throw new Error("Failed to fetch memory overview")
      }

      const data = await res.json()
      setOverview(data.data)
    } catch (err) {
      console.error("Failed to fetch memory overview:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const getTotalMemoryItems = (): number => {
    if (!overview) return 0
    return (
      overview.where.structures +
      overview.what.modules +
      overview.how.implementations +
      overview.why.decisions.total +
      overview.who.collaborators +
      overview.when.events +
      overview.when.milestones.total
    )
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
                <h1 className="text-3xl font-bold text-white mb-2">Memory System</h1>
                <p className="text-muted-foreground">5W+H Cognitive Memory - Where, What, How, Why, Who, When</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchOverview}
                  disabled={isLoading}
                  className="border-white/10 hover:bg-white/5"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
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
                  <Button onClick={fetchOverview} variant="outline">
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Overview Stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-white/10 bg-black/40">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      Total Memory Items
                    </CardTitle>
                    <Database className="h-4 w-4 text-purple-400" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="h-8 w-20 bg-white/10 rounded animate-pulse" />
                    ) : (
                      <div className="text-2xl font-bold text-white">{getTotalMemoryItems()}</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-black/40">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      Active Decisions
                    </CardTitle>
                    <Zap className="h-4 w-4 text-yellow-400" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="h-8 w-16 bg-white/10 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">
                          {overview?.why.decisions.active || 0}
                        </span>
                        {(overview?.why.decisions.revisit || 0) > 0 && (
                          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-400">
                            {overview?.why.decisions.revisit} to revisit
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-black/40">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      Pending Milestones
                    </CardTitle>
                    <Brain className="h-4 w-4 text-cyan-400" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="h-8 w-16 bg-white/10 rounded animate-pulse" />
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">
                          {overview?.when.milestones.pending || 0}
                        </span>
                        {(overview?.when.milestones.achieved || 0) > 0 && (
                          <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">
                            {overview?.when.milestones.achieved} achieved
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Memory Layers Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {isLoading ? (
                  <>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <MemoryLayerSkeleton key={i} />
                    ))}
                  </>
                ) : overview ? (
                  <>
                    <MemoryLayerCard
                      layer="where"
                      title="WHERE"
                      description={overview.where.description}
                      primaryCount={overview.where.structures}
                      primaryLabel="structures"
                      compressionLevel={overview.settings?.whereCompression || 50}
                      onClick={() => console.log("Navigate to WHERE")}
                    />
                    <MemoryLayerCard
                      layer="what"
                      title="WHAT"
                      description={overview.what.description}
                      primaryCount={overview.what.modules}
                      primaryLabel="modules"
                      compressionLevel={overview.settings?.whatCompression || 50}
                      onClick={() => console.log("Navigate to WHAT")}
                    />
                    <MemoryLayerCard
                      layer="how"
                      title="HOW"
                      description={overview.how.description}
                      primaryCount={overview.how.implementations}
                      primaryLabel="implementations"
                      compressionLevel={overview.settings?.howCompression || 50}
                      onClick={() => console.log("Navigate to HOW")}
                    />
                    <MemoryLayerCard
                      layer="why"
                      title="WHY"
                      description={overview.why.description}
                      primaryCount={overview.why.decisions.total}
                      primaryLabel="decisions"
                      secondaryCounts={[
                        { label: "active", value: overview.why.decisions.active },
                        { label: "resolved", value: overview.why.decisions.resolved },
                        { label: "revisit", value: overview.why.decisions.revisit },
                      ]}
                      compressionLevel={overview.settings?.whyCompression || 50}
                      onClick={() => console.log("Navigate to WHY")}
                    />
                    <MemoryLayerCard
                      layer="who"
                      title="WHO"
                      description={overview.who.description}
                      primaryCount={overview.who.collaborators}
                      primaryLabel="collaborators"
                      compressionLevel={overview.settings?.whoCompression || 50}
                      onClick={() => console.log("Navigate to WHO")}
                    />
                    <MemoryLayerCard
                      layer="when"
                      title="WHEN"
                      description={overview.when.description}
                      primaryCount={overview.when.events}
                      primaryLabel="events"
                      secondaryCounts={[
                        { label: "milestones", value: overview.when.milestones.total },
                        { label: "achieved", value: overview.when.milestones.achieved },
                        { label: "pending", value: overview.when.milestones.pending },
                      ]}
                      compressionLevel={overview.settings?.whenCompression || 50}
                      onClick={() => console.log("Navigate to WHEN")}
                    />
                  </>
                ) : null}
              </div>

              {/* Compression Settings Overview */}
              {overview?.settings && (
                <Card className="border-white/10 bg-black/40">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Compression Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Auto Compress</span>
                          <Badge variant={overview.settings.autoCompress ? "default" : "outline"}>
                            {overview.settings.autoCompress ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Max Tokens/Request</span>
                          <span className="text-white">{overview.settings.maxTokensPerRequest?.toLocaleString() || "N/A"}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Decision Retention</span>
                          <span className="text-white">{overview.settings.retentionDecisions || 90} days</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Activity Retention</span>
                          <span className="text-white">{overview.settings.retentionActivity || 30} days</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
