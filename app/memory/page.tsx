"use client"

import { useState, useEffect } from "react"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { MemoryLayerCard, MemoryLayerSkeleton } from "@/components/memory"
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
      if (!res.ok) throw new Error("Failed to fetch memory overview")
      const data = await res.json()
      setOverview(data.data)
    } catch (err) {
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
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* Stats strip */}
        <div className="opx-fit">
          <div className="j-card j-tight">
            <div className="j-eyebrow">Total memory items</div>
            <div className="j-row j-between" style={{ marginTop: 8, alignItems: "flex-end" }}>
              {isLoading ? (
                <div className="j-dot-pulse" />
              ) : (
                <div className="j-amount-lg j-num">{getTotalMemoryItems()}</div>
              )}
            </div>
            <div className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>indexed memories</div>
          </div>

          <div className="j-card j-tight">
            <div className="j-eyebrow">Active decisions</div>
            <div className="j-row j-between" style={{ marginTop: 8, alignItems: "flex-end" }}>
              {isLoading ? (
                <div className="j-dot-pulse" />
              ) : (
                <div className="j-amount-lg j-num">{overview?.why.decisions.active ?? 0}</div>
              )}
            </div>
            <div className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {(overview?.why.decisions.revisit ?? 0) > 0
                ? `${overview!.why.decisions.revisit} to revisit`
                : "no revisits pending"}
            </div>
          </div>

          <div className="j-card j-tight">
            <div className="j-eyebrow">Pending milestones</div>
            <div className="j-row j-between" style={{ marginTop: 8, alignItems: "flex-end" }}>
              {isLoading ? (
                <div className="j-dot-pulse" />
              ) : (
                <div className="j-amount-lg j-num">{overview?.when.milestones.pending ?? 0}</div>
              )}
            </div>
            <div className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {(overview?.when.milestones.achieved ?? 0) > 0
                ? `${overview!.when.milestones.achieved} achieved`
                : "none achieved yet"}
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="j-card" style={{ textAlign: "center", padding: 32 }}>
            <p style={{ color: "var(--j-neg)", marginBottom: 12 }}>{error}</p>
            <button className="j-btn j-btn-ghost" onClick={fetchOverview}>Try again</button>
          </div>
        )}

        {/* Memory layers grid */}
        {!error && (
          <div className="opx-fit">
            {isLoading ? (
              [1,2,3,4,5,6].map(i => <MemoryLayerSkeleton key={i} />)
            ) : overview ? (
              <>
                <MemoryLayerCard layer="where" title="WHERE" description={overview.where.description} primaryCount={overview.where.structures} primaryLabel="structures" compressionLevel={overview.settings?.whereCompression ?? undefined} />
                <MemoryLayerCard layer="what" title="WHAT" description={overview.what.description} primaryCount={overview.what.modules} primaryLabel="modules" compressionLevel={overview.settings?.whatCompression ?? undefined} />
                <MemoryLayerCard layer="how" title="HOW" description={overview.how.description} primaryCount={overview.how.implementations} primaryLabel="implementations" compressionLevel={overview.settings?.howCompression ?? undefined} />
                <MemoryLayerCard layer="why" title="WHY" description={overview.why.description} primaryCount={overview.why.decisions.total} primaryLabel="decisions" secondaryCounts={[{ label: "active", value: overview.why.decisions.active }, { label: "resolved", value: overview.why.decisions.resolved }, { label: "revisit", value: overview.why.decisions.revisit }]} compressionLevel={overview.settings?.whyCompression ?? undefined} />
                <MemoryLayerCard layer="who" title="WHO" description={overview.who.description} primaryCount={overview.who.collaborators} primaryLabel="collaborators" compressionLevel={overview.settings?.whoCompression ?? undefined} />
                <MemoryLayerCard layer="when" title="WHEN" description={overview.when.description} primaryCount={overview.when.events} primaryLabel="events" secondaryCounts={[{ label: "milestones", value: overview.when.milestones.total }, { label: "achieved", value: overview.when.milestones.achieved }, { label: "pending", value: overview.when.milestones.pending }]} compressionLevel={overview.settings?.whenCompression ?? undefined} />
              </>
            ) : null}
          </div>
        )}

        {/* Compression settings */}
        {!error && overview?.settings && (
          <div className="j-card">
            <div className="j-card-head">
              <p className="j-card-title">Compression settings</p>
              <div className="j-row j-gap-2">
                <span className="j-pill j-muted">Auto compress: {overview.settings.autoCompress ? "on" : "off"}</span>
                <span className="j-pill j-muted">{overview.settings.maxTokensPerRequest?.toLocaleString() ?? "—"} tokens/req</span>
              </div>
            </div>
            <div className="opx-fit" style={{ marginTop: 12 }}>
              <div className="j-col" style={{ gap: 4 }}>
                <span className="j-eyebrow">Decision retention</span>
                <span style={{ fontSize: 14 }}>{overview.settings.retentionDecisions != null ? `${overview.settings.retentionDecisions} days` : "Not set"}</span>
              </div>
              <div className="j-col" style={{ gap: 4 }}>
                <span className="j-eyebrow">Activity retention</span>
                <span style={{ fontSize: 14 }}>{overview.settings.retentionActivity != null ? `${overview.settings.retentionActivity} days` : "Not set"}</span>
              </div>
              <div className="j-col" style={{ gap: 4 }}>
                <button className="opx-btn sm" onClick={fetchOverview} style={{ alignSelf: "flex-start" }}>Refresh</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
