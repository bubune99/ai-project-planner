"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Lightbulb, Layers, Link2, GitBranch } from "lucide-react"
import type { CanvasStats } from "@/lib/types"

interface SimpleCanvasStatsProps {
  stats: CanvasStats
}

export function SimpleCanvasStats({ stats }: SimpleCanvasStatsProps) {
  const statItems = [
    {
      label: "Total Nodes",
      value: stats.totalNodes,
      icon: <Lightbulb className="w-4 h-4" />,
      color: "text-yellow-400",
    },
    {
      label: "Facets",
      value: stats.nodesByType.facets,
      icon: <Layers className="w-4 h-4" />,
      color: "text-purple-400",
    },
    {
      label: "Connections",
      value: stats.totalConnections,
      icon: <Link2 className="w-4 h-4" />,
      color: "text-blue-400",
    },
    {
      label: "Branches",
      value: stats.totalBranches,
      icon: <GitBranch className="w-4 h-4" />,
      color: "text-green-400",
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Canvas Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={item.color}>{item.icon}</div>
              <div>
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
