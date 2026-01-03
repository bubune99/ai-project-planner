"use client"

import { Card } from "@/components/ui/card"
import { FolderKanban, TrendingUp, Activity, Heart } from 'lucide-react'
import type { ProjectSummary } from "@/lib/types"

interface ProjectStatsProps {
  projects: ProjectSummary[]
}

export function ProjectStats({ projects }: ProjectStatsProps) {
  // Handle null/undefined and ensure we have an array
  const safeProjects = Array.isArray(projects) ? projects : []

  const stats = {
    total: safeProjects.length,
    active: safeProjects.filter((p) => p.status === "in_progress").length,
    totalTasks: safeProjects.reduce((sum, p) => sum + (p.totalTasks || 0), 0),
    completedTasks: safeProjects.reduce((sum, p) => sum + (p.completedTasks || 0), 0),
    activeAgents: safeProjects.reduce((sum, p) => sum + (p.activeAgents || 0), 0),
  }

  // Calculate health score based on project health distribution
  const healthScores = { excellent: 100, good: 80, attention: 50, critical: 20 }
  const healthScore = safeProjects.length > 0
    ? Math.round(
        safeProjects.reduce((sum, p) => sum + (healthScores[p.health] || 80), 0) / safeProjects.length
      )
    : 0

  const completionRate = stats.totalTasks > 0
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0

  // Count projects by health status
  const healthCounts = {
    excellent: safeProjects.filter(p => p.health === 'excellent').length,
    good: safeProjects.filter(p => p.health === 'good').length,
    attention: safeProjects.filter(p => p.health === 'attention').length,
    critical: safeProjects.filter(p => p.health === 'critical').length,
  }

  const healthSubtext = safeProjects.length > 0
    ? healthCounts.critical > 0
      ? `${healthCounts.critical} need attention`
      : healthCounts.excellent > 0
        ? `${healthCounts.excellent} excellent`
        : `${safeProjects.length} projects`
    : "No projects"

  const statCards = [
    {
      icon: FolderKanban,
      label: "Total Projects",
      value: stats.total,
      subtext: `${stats.active} active`,
      color: "text-blue-400",
    },
    {
      icon: TrendingUp,
      label: "Overall Progress",
      value: `${completionRate}%`,
      subtext: `${stats.completedTasks}/${stats.totalTasks} tasks`,
      color: "text-green-400",
    },
    {
      icon: Activity,
      label: "In Progress",
      value: stats.activeAgents,
      subtext: "Active tasks",
      color: "text-yellow-400",
    },
    {
      icon: Heart,
      label: "Health Score",
      value: safeProjects.length > 0 ? `${healthScore}%` : "—",
      subtext: healthSubtext,
      color: "text-purple-400",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statCards.map((stat, index) => (
        <Card
          key={index}
          className="relative overflow-hidden border-white/10 bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-all duration-300"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20" />
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <p className="text-xs text-muted-foreground/60">{stat.subtext}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
