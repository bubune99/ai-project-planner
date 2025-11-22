"use client"

import { Card } from "@/components/ui/card"
import { FolderKanban, TrendingUp, Users, Zap } from 'lucide-react'
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
    totalTasks: safeProjects.reduce((sum, p) => sum + ((p as any).total_tasks || (p as any).totalTasks || 0), 0),
    completedTasks: safeProjects.reduce((sum, p) => sum + ((p as any).completed_tasks || (p as any).completedTasks || 0), 0),
    activeAgents: safeProjects.reduce((sum, p) => sum + ((p as any).active_agents || (p as any).activeAgents || 0), 0),
  }

  const completionRate = stats.totalTasks > 0
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0

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
      icon: Zap,
      label: "Active Agents",
      value: stats.activeAgents,
      subtext: "Working now",
      color: "text-yellow-400",
    },
    {
      icon: Users,
      label: "Health Score",
      value: "85%",
      subtext: "All projects",
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
