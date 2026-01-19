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
        "border-white/10 bg-black/40 hover:bg-black/50 transition-all cursor-pointer group"
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", config.bgColor)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div>
            <CardTitle className="text-lg font-medium text-white">{title}</CardTitle>
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      </CardHeader>
      <CardContent>
        {/* Primary Metric */}
        <div className="mb-4">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{primaryCount}</span>
            <span className="text-sm text-gray-400 mb-1">{primaryLabel}</span>
          </div>
        </div>

        {/* Secondary Metrics */}
        {secondaryCounts && secondaryCounts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {secondaryCounts.map((item) => (
              <Badge
                key={item.label}
                variant="outline"
                className="text-xs border-white/10 text-gray-400"
              >
                {item.value} {item.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Compression Level */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Compression</span>
            <span className="text-gray-400">{compressionLevel}%</span>
          </div>
          <Progress value={compressionLevel} className="h-1.5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function MemoryLayerSkeleton() {
  return (
    <Card className="border-white/10 bg-black/40 animate-pulse">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/10" />
          <div>
            <div className="h-5 w-24 bg-white/10 rounded" />
            <div className="h-3 w-40 bg-white/10 rounded mt-2" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="h-8 w-20 bg-white/10 rounded" />
        </div>
        <div className="flex gap-2 mb-4">
          <div className="h-5 w-16 bg-white/10 rounded" />
          <div className="h-5 w-16 bg-white/10 rounded" />
        </div>
        <div className="h-1.5 bg-white/10 rounded" />
      </CardContent>
    </Card>
  )
}
