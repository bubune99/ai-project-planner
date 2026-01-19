"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sparkles,
  Compass,
  CheckCircle2,
  Rocket,
  Archive,
  MoreVertical,
  GitBranch,
  Layers,
  MessageSquare,
  Tag,
  Eye,
  EyeOff,
  Globe,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Idea, IdeaLifecycle } from "@/lib/types"

interface IdeaCardProps {
  idea: Idea
  onClick?: (idea: Idea) => void
  onEdit?: (idea: Idea) => void
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
  onPromote?: (idea: Idea) => void
}

const lifecycleConfig: Record<IdeaLifecycle, { icon: typeof Sparkles; color: string; label: string; bgColor: string }> = {
  seed: { icon: Sparkles, color: "text-yellow-400", label: "Seed", bgColor: "bg-yellow-500/20" },
  exploring: { icon: Compass, color: "text-blue-400", label: "Exploring", bgColor: "bg-blue-500/20" },
  refined: { icon: CheckCircle2, color: "text-green-400", label: "Refined", bgColor: "bg-green-500/20" },
  promoted: { icon: Rocket, color: "text-purple-400", label: "Promoted", bgColor: "bg-purple-500/20" },
  archived: { icon: Archive, color: "text-gray-400", label: "Archived", bgColor: "bg-gray-500/20" },
}

const visibilityConfig: Record<string, { icon: typeof Eye; label: string }> = {
  private: { icon: EyeOff, label: "Private" },
  shared: { icon: Users, label: "Shared" },
  public: { icon: Globe, label: "Public" },
}

export function IdeaCard({ idea, onClick, onEdit, onDelete, onArchive, onPromote }: IdeaCardProps) {
  const lifecycle = lifecycleConfig[idea.lifecycle] || lifecycleConfig.seed
  const visibility = visibilityConfig[idea.visibility] || visibilityConfig.private
  const Icon = lifecycle.icon
  const VisibilityIcon = visibility.icon

  return (
    <Card
      className={cn(
        "border-white/10 bg-black/40 hover:bg-black/50 transition-all cursor-pointer group",
        idea.lifecycle === "archived" && "opacity-60"
      )}
      onClick={() => onClick?.(idea)}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0", lifecycle.bgColor)}>
            <Icon className={cn("h-5 w-5", lifecycle.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium text-white truncate">
              {idea.title}
            </CardTitle>
            {idea.category && (
              <p className="text-xs text-gray-500 mt-1">{idea.category}</p>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-black/90 border-white/10">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(idea) }}>
              Edit Idea
            </DropdownMenuItem>
            {idea.lifecycle === "refined" && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPromote?.(idea) }}>
                <Rocket className="h-4 w-4 mr-2" />
                Promote to Project
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {idea.lifecycle !== "archived" ? (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive?.(idea.id) }}>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive?.(idea.id) }}>
                Restore
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-red-400"
              onClick={(e) => { e.stopPropagation(); onDelete?.(idea.id) }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {idea.description && (
          <p className="text-sm text-gray-400 line-clamp-2 mb-3">
            {idea.description}
          </p>
        )}

        {/* Tags */}
        {idea.tags && idea.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {idea.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs border-white/10 text-gray-400"
              >
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
            {idea.tags.length > 3 && (
              <Badge variant="outline" className="text-xs border-white/10 text-gray-400">
                +{idea.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Stats & Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {(idea.branchCount ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                <span>{idea.branchCount}</span>
              </div>
            )}
            {(idea.facetCount ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                <span>{idea.facetCount}</span>
              </div>
            )}
            {(idea.validationCount ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <span>{idea.validationCount}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <VisibilityIcon className="h-3 w-3 text-gray-500" />
            <Badge variant="outline" className={cn("text-xs border-transparent", lifecycle.bgColor, lifecycle.color)}>
              {lifecycle.label}
            </Badge>
          </div>
        </div>

        {/* Promoted Project Link */}
        {idea.promotedToProjectId && idea.projectName && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs text-purple-400">
              <Rocket className="h-3 w-3" />
              <span>Promoted to: {idea.projectName}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
