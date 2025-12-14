"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Clock, CheckCircle2, Activity, AlertCircle } from 'lucide-react'
import type { ProjectSummary } from "@/lib/types"

interface ProjectCardProps {
  project: ProjectSummary
  onSelect: (projectId: string) => void
}

const statusColors = {
  planning: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_progress: "bg-green-500/10 text-green-400 border-green-500/20",
  review: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  completed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  on_hold: "bg-orange-500/10 text-orange-400 border-orange-500/20",
}

const healthColors = {
  excellent: "text-green-400",
  good: "text-blue-400",
  attention: "text-orange-400",
  critical: "text-red-400",
}

const healthIcons = {
  excellent: CheckCircle2,
  good: Activity,
  attention: AlertCircle,
  critical: AlertCircle,
}

export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  const health = project.health || 'good'
  const HealthIcon = healthIcons[health]
  const timeSinceLastActivity = project.lastActivity ? getTimeSince(project.lastActivity) : 'Never'

  return (
    <Card className="group relative overflow-hidden border-white/10 bg-black/40 backdrop-blur-sm hover:bg-black/60 hover:border-white/20 transition-all duration-300">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="relative p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{project.name || 'Untitled Project'}</h3>
              <HealthIcon className={`h-4 w-4 ${healthColors[health]}`} />
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{project.description || 'No description'}</p>
          </div>
        </div>

        {/* Status and Phase */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${statusColors[project.status] || statusColors.planning} border`}>
            {(project.status || 'planning').replace("_", " ")}
          </Badge>
          {project.phase && <span className="text-xs text-muted-foreground">{project.phase}</span>}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="text-white font-medium">{project.progress || 0}%</span>
          </div>
          <Progress value={project.progress || 0} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {project.completedTasks || 0} / {project.totalTasks || 0} tasks
            </span>
            <span>{project.activeAgents || 0} agents active</span>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="flex items-center gap-2 flex-wrap">
          {(project.techStack || []).slice(0, 4).map((tech) => (
            <Badge key={tech} variant="outline" className="text-xs border-white/10 bg-white/5">
              {tech}
            </Badge>
          ))}
          {(project.techStack || []).length > 4 && (
            <Badge variant="outline" className="text-xs border-white/10 bg-white/5">
              +{(project.techStack || []).length - 4}
            </Badge>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{timeSinceLastActivity}</span>
          </div>
          <Button
            onClick={() => onSelect(project.id)}
            size="sm"
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            Open Project
          </Button>
        </div>
      </div>
    </Card>
  )
}

function getTimeSince(date: Date | string): string {
  const now = new Date()
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const diff = now.getTime() - dateObj.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return "Just now"
}
