"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Activity,
  CheckSquare,
  Clock,
  DollarSign,
  FolderKanban,
  Lightbulb,
  Flag,
  Scale,
  RefreshCw,
} from "lucide-react"

interface ActivityItem {
  id: string
  type: "project" | "idea" | "todo" | "transaction" | "decision" | "milestone"
  action: string
  title: string
  description: string | null
  entityId: string
  timestamp: string
  metadata?: Record<string, any>
}

const typeIcons: Record<string, React.ReactNode> = {
  project: <FolderKanban className="h-4 w-4 text-blue-400" />,
  idea: <Lightbulb className="h-4 w-4 text-yellow-400" />,
  todo: <CheckSquare className="h-4 w-4 text-green-400" />,
  transaction: <DollarSign className="h-4 w-4 text-purple-400" />,
  decision: <Scale className="h-4 w-4 text-orange-400" />,
  milestone: <Flag className="h-4 w-4 text-cyan-400" />,
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/dashboard/activity?limit=10")
      if (!res.ok) {
        throw new Error("Failed to fetch activity")
      }
      const json = await res.json()
      if (json.success) {
        setActivities(json.data || [])
      } else {
        throw new Error(json.error?.message || "Unknown error")
      }
    } catch (err: any) {
      console.error("Failed to fetch activity:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            Recent Activity
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" onClick={fetchActivities}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full bg-white/10" />
            ))}
          </div>
        ) : error ? (
          <div>
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="ghost" size="sm" onClick={fetchActivities} className="mt-2 text-gray-400">
              <RefreshCw className="mr-2 h-3 w-3" /> Retry
            </Button>
          </div>
        ) : activities.length > 0 ? (
          <div className="space-y-1">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="mt-1">
                  {typeIcons[activity.type] || <Activity className="h-4 w-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {activity.title}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {activity.description}
                  </p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
