"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertTriangle,
  Calendar,
  Clock,
  Flag,
  Lightbulb,
  Lock,
  Target,
  Zap,
  ArrowRight,
  RefreshCw,
} from "lucide-react"

interface FocusProject {
  id: string
  name: string
}

interface FocusItem {
  id: string
  type: "todo" | "step" | "idea" | "milestone"
  title: string
  description?: string | null
  priority?: string
  dueDate?: string
  targetDate?: string
  status?: string
  lifecycle?: string
  category?: string
  validationCount?: number
  project?: FocusProject | null
  urgency: "overdue" | "today" | "blocked" | "review" | "upcoming" | "in-progress"
}

interface FocusSummary {
  overdueCount: number
  todayCount: number
  blockedCount: number
  ideasToReviewCount: number
  milestonesThisWeek: number
  activeWorkCount: number
}

interface FocusData {
  overdue: FocusItem[]
  today: FocusItem[]
  blocked: FocusItem[]
  ideasToReview: FocusItem[]
  milestones: FocusItem[]
  activeWork: FocusItem[]
  summary: FocusSummary
}

const priorityColors: Record<string, string> = {
  critical: "text-red-400 border-red-500/50",
  high: "text-orange-400 border-orange-500/50",
  medium: "text-yellow-400 border-yellow-500/50",
  low: "text-gray-400 border-gray-500/50",
}

function getItemLink(item: FocusItem): string {
  switch (item.type) {
    case "todo":
      return "/todos"
    case "step":
      return item.project ? `/projects/${item.project.id}` : "/projects"
    case "idea":
      return `/ideas`
    case "milestone":
      return item.project ? `/projects/${item.project.id}` : "/projects"
    default:
      return "/dashboard"
  }
}

function formatDueDate(dateStr?: string): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < -1) return `${Math.abs(diffDays)} days overdue`
  if (diffDays === -1) return "1 day overdue"
  if (diffDays === 0) return "Due today"
  if (diffDays === 1) return "Due tomorrow"
  return `Due in ${diffDays} days`
}

function FocusItemRow({
  item,
  onToggle,
}: {
  item: FocusItem
  onToggle?: (id: string) => void
}) {
  const canToggle = item.type === "todo"

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group">
      {canToggle ? (
        <Checkbox
          className="mt-0.5"
          onCheckedChange={() => onToggle?.(item.id)}
        />
      ) : (
        <div className="mt-1">
          {item.urgency === "overdue" && <AlertTriangle className="h-4 w-4 text-red-400" />}
          {item.urgency === "today" && <Clock className="h-4 w-4 text-orange-400" />}
          {item.urgency === "blocked" && <Lock className="h-4 w-4 text-yellow-400" />}
          {item.urgency === "review" && <Lightbulb className="h-4 w-4 text-purple-400" />}
          {item.urgency === "upcoming" && <Target className="h-4 w-4 text-blue-400" />}
          {item.urgency === "in-progress" && <Zap className="h-4 w-4 text-cyan-400" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Link href={getItemLink(item)} className="block">
          <p className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {item.project && (
              <span className="text-xs text-gray-500">{item.project.name}</span>
            )}
            {item.dueDate && (
              <span className={`text-xs ${item.urgency === "overdue" ? "text-red-400" : "text-gray-400"}`}>
                {formatDueDate(item.dueDate)}
              </span>
            )}
            {item.targetDate && (
              <span className="text-xs text-gray-400">
                {formatDueDate(item.targetDate)}
              </span>
            )}
            {item.lifecycle && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-purple-500/50 text-purple-400">
                {item.lifecycle}
              </Badge>
            )}
          </div>
        </Link>
      </div>
      {item.priority && (
        <Badge
          variant="outline"
          className={`text-[10px] py-0 px-1.5 ${priorityColors[item.priority] || "text-gray-400 border-gray-500/50"}`}
        >
          {item.priority}
        </Badge>
      )}
    </div>
  )
}

export function TodaysFocus() {
  const [data, setData] = useState<FocusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFocus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/dashboard/focus")
      if (!res.ok) {
        throw new Error("Failed to fetch focus data")
      }
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        throw new Error(json.error?.message || "Unknown error")
      }
    } catch (err: any) {
      console.error("Failed to fetch focus data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFocus()
  }, [fetchFocus])

  const handleToggleTodo = async (todoId: string) => {
    try {
      const res = await fetch(`/api/todos/${todoId}/toggle`, { method: "PATCH" })
      if (res.ok) {
        fetchFocus()
      }
    } catch (err) {
      console.error("Failed to toggle todo:", err)
    }
  }

  if (loading) {
    return (
      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-400" />
            Today&apos;s Focus
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full bg-white/10" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-400" />
            Today&apos;s Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchFocus} className="mt-2 text-gray-400">
            <RefreshCw className="mr-2 h-3 w-3" /> Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const { summary } = data
  const totalItems =
    summary.overdueCount +
    summary.todayCount +
    summary.blockedCount +
    summary.ideasToReviewCount +
    summary.milestonesThisWeek +
    summary.activeWorkCount

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-400" />
            Today&apos;s Focus
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/20 text-gray-300">
              {totalItems} item{totalItems !== 1 ? "s" : ""}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400" onClick={fetchFocus}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overdue - Red/Urgent */}
        {data.overdue.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Overdue ({data.overdue.length})
              </span>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5">
              {data.overdue.map((item) => (
                <FocusItemRow key={`overdue-${item.id}`} item={item} onToggle={handleToggleTodo} />
              ))}
            </div>
          </div>
        )}

        {/* Today's Tasks */}
        {data.today.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-orange-400" />
              <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                Due Today ({data.today.length})
              </span>
            </div>
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5">
              {data.today.map((item) => (
                <FocusItemRow key={`today-${item.id}`} item={item} onToggle={handleToggleTodo} />
              ))}
            </div>
          </div>
        )}

        {/* Active Work */}
        {data.activeWork.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                In Progress ({data.activeWork.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {data.activeWork.map((item) => (
                <FocusItemRow key={`active-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Blocked Steps */}
        {data.blocked.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
                Blocked ({data.blocked.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {data.blocked.map((item) => (
                <FocusItemRow key={`blocked-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Milestones */}
        {data.milestones.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Flag className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                Milestones This Week ({data.milestones.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {data.milestones.map((item) => (
                <FocusItemRow key={`milestone-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Ideas to Review */}
        {data.ideasToReview.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                Ideas to Review ({data.ideasToReview.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {data.ideasToReview.map((item) => (
                <FocusItemRow key={`idea-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {totalItems === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Target className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">All clear!</p>
            <p className="text-xs mt-1">No urgent items need your attention.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
