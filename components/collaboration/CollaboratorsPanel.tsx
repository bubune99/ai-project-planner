"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Crown,
  Shield,
  Edit3,
  Eye,
  MoreVertical,
  Loader2,
  Trash2,
  UserMinus,
} from "lucide-react";
import type { CollaboratorRole } from "@/lib/db/schema";
import { InviteDialog } from "./InviteDialog";

interface Collaborator {
  id: string;
  userId: string;
  role: CollaboratorRole;
  acceptedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

interface Owner {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface CollaboratorsPanelProps {
  projectId: string;
  owner: Owner;
  collaborators: Collaborator[];
  currentUserId: string;
  currentUserRole: CollaboratorRole | "owner";
  onRoleChange?: (collaboratorId: string, newRole: CollaboratorRole) => Promise<void>;
  onRemove?: (collaboratorId: string) => Promise<void>;
  onInviteSuccess?: () => void;
}

const roleIcons: Record<CollaboratorRole | "owner", typeof Crown> = {
  owner: Crown,
  admin: Shield,
  editor: Edit3,
  viewer: Eye,
};

const roleLabels: Record<CollaboratorRole | "owner", string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const roleColors: Record<CollaboratorRole | "owner", string> = {
  owner: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  admin: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  editor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  viewer: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
};

function Avatar({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email[0].toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { role: CollaboratorRole | "owner" }) {
  const Icon = roleIcons[role];
  return (
    <Badge variant="outline" className={roleColors[role]}>
      <Icon className="w-3 h-3 mr-1" />
      {roleLabels[role]}
    </Badge>
  );
}

export function CollaboratorsPanel({
  projectId,
  owner,
  collaborators,
  currentUserId,
  currentUserRole,
  onRoleChange,
  onRemove,
  onInviteSuccess,
}: CollaboratorsPanelProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const isOwner = currentUserRole === "owner";

  const handleRoleChange = useCallback(
    async (collaboratorId: string, newRole: CollaboratorRole) => {
      if (!onRoleChange) return;
      setUpdatingId(collaboratorId);
      try {
        await onRoleChange(collaboratorId, newRole);
      } finally {
        setUpdatingId(null);
      }
    },
    [onRoleChange]
  );

  const handleRemove = useCallback(
    async (collaboratorId: string) => {
      if (!onRemove) return;
      setRemovingId(collaboratorId);
      try {
        await onRemove(collaboratorId);
      } finally {
        setRemovingId(null);
        setShowActionsFor(null);
      }
    },
    [onRemove]
  );

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Collaborators</h3>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {/* Owner */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Avatar name={owner.name} email={owner.email} avatarUrl={owner.avatarUrl} />
              <div>
                <p className="text-sm font-medium">
                  {owner.name || owner.email}
                  {owner.id === currentUserId && (
                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{owner.email}</p>
              </div>
            </div>
            <RoleBadge role="owner" />
          </div>

          {/* Collaborators */}
          {collaborators.map((collaborator) => (
            <div
              key={collaborator.id}
              className="flex items-center justify-between py-2 border-t border-border/50"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={collaborator.user.name}
                  email={collaborator.user.email}
                  avatarUrl={collaborator.user.avatarUrl}
                />
                <div>
                  <p className="text-sm font-medium">
                    {collaborator.user.name || collaborator.user.email}
                    {collaborator.userId === currentUserId && (
                      <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{collaborator.user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Role selector or badge */}
                {canManage &&
                collaborator.userId !== currentUserId &&
                (isOwner || collaborator.role !== "admin") ? (
                  <Select
                    value={collaborator.role}
                    onValueChange={(value) =>
                      handleRoleChange(collaborator.id, value as CollaboratorRole)
                    }
                    disabled={updatingId === collaborator.id}
                  >
                    <SelectTrigger className="w-[120px]" size="sm">
                      {updatingId === collaborator.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      {isOwner && <SelectItem value="admin">Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                ) : (
                  <RoleBadge role={collaborator.role} />
                )}

                {/* Actions button */}
                {(canManage && collaborator.userId !== currentUserId) ||
                collaborator.userId === currentUserId ? (
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        setShowActionsFor(
                          showActionsFor === collaborator.id ? null : collaborator.id
                        )
                      }
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>

                    {showActionsFor === collaborator.id && (
                      <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[120px]">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => handleRemove(collaborator.id)}
                          disabled={removingId === collaborator.id}
                        >
                          {removingId === collaborator.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : collaborator.userId === currentUserId ? (
                            <UserMinus className="w-4 h-4" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          {collaborator.userId === currentUserId ? "Leave" : "Remove"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {collaborators.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No collaborators yet. Invite someone to get started!
            </p>
          )}
        </div>
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        projectId={projectId}
        canCreateAdminInvites={isOwner}
        onSuccess={() => {
          setInviteOpen(false);
          onInviteSuccess?.();
        }}
      />
    </>
  );
}
