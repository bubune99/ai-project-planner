"use client"

import { Badge } from "@/components/ui/badge"
import { Sparkles, Search, CheckCircle, Rocket, Archive } from "lucide-react"

interface LifecycleBadgeProps {
  stage: string
  className?: string
}

export function SimpleLifecycleBadge({ stage, className }: LifecycleBadgeProps) {
  const normalizedStage = stage.toLowerCase()

  const stageConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    seed: {
      icon: <Sparkles className="w-3 h-3" />,
      color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      label: "Seed",
    },
    exploring: {
      icon: <Search className="w-3 h-3" />,
      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      label: "Exploring",
    },
    refined: {
      icon: <CheckCircle className="w-3 h-3" />,
      color: "bg-green-500/20 text-green-400 border-green-500/30",
      label: "Refined",
    },
    promoted: {
      icon: <Rocket className="w-3 h-3" />,
      color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      label: "Promoted",
    },
    archived: {
      icon: <Archive className="w-3 h-3" />,
      color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      label: "Archived",
    },
  }

  const config = stageConfig[normalizedStage] || stageConfig.seed

  return (
    <Badge variant="outline" className={`${config.color} flex items-center gap-1.5 ${className}`}>
      {config.icon}
      {config.label}
    </Badge>
  )
}
