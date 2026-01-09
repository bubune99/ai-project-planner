"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  UserMinus,
  UserCog,
  Link2,
  Mail,
  Eye,
  Edit3,
  Trash2,
  FileText,
  MessageSquare,
  Clock,
  Loader2,
  RefreshCw,
  ChevronDown,
  Filter,
  X,
} from "lucide-react";
import type { CollaborationActionType } from "@/lib/db/schema";

interface ActivityActor {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface Activity {
  id: string;
  actionType: CollaborationActionType;
  actorRole: string;
  targetType: string | null;
  targetId: string | null;
  description: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: ActivityActor;
}

interface ActivityLogProps {
  projectId: string;
  initialActivities?: Activity[];
  onLoadMore?: () => void;
}

const actionTypeLabels: Record<CollaborationActionType, string> = {
  collaborator_invited: "Invited",
  collaborator_joined: "Joined",
  collaborator_removed: "Removed",
  collaborator_left: "Left",
  role_changed: "Role Changed",
  invitation_created: "Invitation Created",
  invitation_revoked: "Invitation Revoked",
  invitation_expired: "Invitation Expired",
  link_generated: "Link Generated",
  project_viewed: "Viewed",
  project_updated: "Updated Project",
  step_created: "Step Created",
  step_updated: "Step Updated",
  step_deleted: "Step Deleted",
  step_status_changed: "Status Changed",
  document_created: "Document Created",
  document_updated: "Document Updated",
  document_deleted: "Document Deleted",
  note_created: "Note Created",
  note_updated: "Note Updated",
  comment_added: "Comment Added",
  adr_created: "ADR Created",
  adr_updated: "ADR Updated",
};

const actionTypeIcons: Record<string, typeof UserPlus> = {
  collaborator_invited: UserPlus,
  collaborator_joined: UserPlus,
  collaborator_removed: UserMinus,
  collaborator_left: UserMinus,
  role_changed: UserCog,
  invitation_created: Mail,
  invitation_revoked: X,
  invitation_expired: Clock,
  link_generated: Link2,
  project_viewed: Eye,
  project_updated: Edit3,
  step_created: FileText,
  step_updated: Edit3,
  step_deleted: Trash2,
  step_status_changed: RefreshCw,
  document_created: FileText,
  document_updated: Edit3,
  document_deleted: Trash2,
  note_created: MessageSquare,
  note_updated: Edit3,
  comment_added: MessageSquare,
  adr_created: FileText,
  adr_updated: Edit3,
};

const actionTypeColors: Record<string, string> = {
  collaborator_invited: "text-green-600",
  collaborator_joined: "text-green-600",
  collaborator_removed: "text-red-600",
  collaborator_left: "text-orange-600",
  role_changed: "text-purple-600",
  invitation_created: "text-blue-600",
  invitation_revoked: "text-red-600",
  invitation_expired: "text-gray-600",
  link_generated: "text-blue-600",
  project_viewed: "text-gray-600",
  project_updated: "text-blue-600",
  step_created: "text-green-600",
  step_updated: "text-blue-600",
  step_deleted: "text-red-600",
  step_status_changed: "text-purple-600",
  document_created: "text-green-600",
  document_updated: "text-blue-600",
  document_deleted: "text-red-600",
  note_created: "text-green-600",
  note_updated: "text-blue-600",
  comment_added: "text-blue-600",
  adr_created: "text-green-600",
  adr_updated: "text-blue-600",
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email[0].toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email}
        className="w-7 h-7 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
      {initials}
    </div>
  );
}

export function ActivityLog({ projectId, initialActivities }: ActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities || []);
  const [loading, setLoading] = useState(!initialActivities);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(initialActivities?.length || 0);
  const [actionTypeFilter, setActionTypeFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchActivities = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setOffset(0);
      }

      try {
        const params = new URLSearchParams({
          limit: "20",
          offset: loadMore ? offset.toString() : "0",
        });

        if (actionTypeFilter) {
          params.set("actionType", actionTypeFilter);
        }

        const response = await fetch(
          `/api/projects/${projectId}/activity?${params.toString()}`
        );
        const data = await response.json();

        if (!response.ok) {
          console.error("Failed to fetch activities:", data.error);
          return;
        }

        const newActivities = data.data.activities;

        if (loadMore) {
          setActivities((prev) => [...prev, ...newActivities]);
          setOffset((prev) => prev + newActivities.length);
        } else {
          setActivities(newActivities);
          setOffset(newActivities.length);
        }

        setHasMore(data.pagination.hasMore);
      } catch (err) {
        console.error("Failed to fetch activities:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [projectId, offset, actionTypeFilter]
  );

  useEffect(() => {
    if (!initialActivities) {
      fetchActivities();
    }
  }, []);

  useEffect(() => {
    fetchActivities(false);
  }, [actionTypeFilter]);

  const filteredActionTypes: CollaborationActionType[] = [
    "collaborator_joined",
    "collaborator_left",
    "collaborator_removed",
    "role_changed",
    "invitation_created",
    "invitation_revoked",
    "project_updated",
    "step_created",
    "step_updated",
    "step_deleted",
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Activity</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? "bg-accent" : ""}
          >
            <Filter className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchActivities(false)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 p-3 bg-muted/50 rounded-md space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter by:</span>
            <Select
              value={actionTypeFilter || "all"}
              onValueChange={(value) =>
                setActionTypeFilter(value === "all" ? null : value)
              }
            >
              <SelectTrigger className="w-[180px]" size="sm">
                <SelectValue placeholder="All activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activities</SelectItem>
                {filteredActionTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {actionTypeLabels[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {actionTypeFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActionTypeFilter(null)}
                className="h-8 px-2"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <div className="space-y-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity yet
          </p>
        ) : (
          activities.map((activity, index) => {
            const Icon = actionTypeIcons[activity.actionType] || Edit3;
            const color = actionTypeColors[activity.actionType] || "text-gray-600";

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0"
              >
                {/* Timeline indicator */}
                <div className="relative">
                  <div className={`w-7 h-7 rounded-full bg-muted flex items-center justify-center ${color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {index < activities.length - 1 && (
                    <div className="absolute left-1/2 top-7 bottom-0 w-px bg-border -translate-x-1/2 h-full" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Avatar
                        name={activity.actor.name}
                        email={activity.actor.email}
                        avatarUrl={activity.actor.avatarUrl}
                      />
                      <span className="text-sm font-medium">
                        {activity.actor.name || activity.actor.email.split("@")[0]}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {actionTypeLabels[activity.actionType]}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(activity.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activity.description}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {/* Load more */}
        {hasMore && !loading && activities.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchActivities(true)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-2" />
              )}
              Load more
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
