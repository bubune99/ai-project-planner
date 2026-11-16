"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  MapPin,
  Package,
  Cog,
  HelpCircle,
  Users,
  Clock,
  ChevronRight,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"

type MemoryLayerType = "where" | "what" | "how" | "why" | "who" | "when"

interface MemoryLayerCardProps {
  layer: MemoryLayerType
  title: string
  description: string
  primaryCount: number
  primaryLabel: string
  secondaryCounts?: { label: string; value: number }[]
  compressionLevel?: number
  onClick?: () => void
}

const layerConfig: Record<MemoryLayerType, { icon: typeof MapPin; color: string; bgColor: string }> = {
  where: { icon: MapPin, color: "text-blue-400", bgColor: "bg-blue-500/20" },
  what: { icon: Package, color: "text-green-400", bgColor: "bg-green-500/20" },
  how: { icon: Cog, color: "text-orange-400", bgColor: "bg-orange-500/20" },
  why: { icon: HelpCircle, color: "text-purple-400", bgColor: "bg-purple-500/20" },
  who: { icon: Users, color: "text-pink-400", bgColor: "bg-pink-500/20" },
  when: { icon: Clock, color: "text-cyan-400", bgColor: "bg-cyan-500/20" },
}

export function MemoryLayerCard({
  layer,
  title,
  description,
  primaryCount,
  primaryLabel,
  secondaryCounts,
  compressionLevel = 50,
  onClick,
}: MemoryLayerCardProps) {
  const config = layerConfig[layer]
  const Icon = config.icon

  return (
    <Card
      className={cn(
        "border-border bg-muted/40 hover:bg-muted transition-all cursor-pointer group"
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", config.bgColor)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div>
            <CardTitle className="text-lg font-medium text-foreground">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </CardHeader>
      <CardContent>
        {/* Primary Metric */}
        <div className="mb-4">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{primaryCount}</span>
            <span className="text-sm text-muted-foreground mb-1">{primaryLabel}</span>
          </div>
        </div>

        {/* Secondary Metrics */}
        {secondaryCounts && secondaryCounts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {secondaryCounts.map((item) => (
              <Badge
                key={item.label}
                variant="outline"
                className="text-xs border-border text-muted-foreground"
              >
                {item.value} {item.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Compression Level */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Compression</span>
            <span className="text-muted-foreground">{compressionLevel}%</span>
          </div>
          <Progress value={compressionLevel} className="h-1.5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function MemoryLayerSkeleton() {
  return (
    <Card className="border-border bg-muted/40 animate-pulse">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted" />
          <div>
            <div className="h-5 w-24 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded mt-2" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="h-8 w-20 bg-muted rounded" />
        </div>
        <div className="flex gap-2 mb-4">
          <div className="h-5 w-16 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded" />
        </div>
        <div className="h-1.5 bg-muted rounded" />
      </CardContent>
    </Card>
  )
}
