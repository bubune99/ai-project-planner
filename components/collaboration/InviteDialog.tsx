"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  Link2,
  Copy,
  Check,
  Loader2,
  Send,
  Shield,
  Edit3,
  Eye,
} from "lucide-react";
import type { CollaboratorRole } from "@/lib/db/schema";

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  canCreateAdminInvites: boolean;
  onSuccess?: () => void;
}

type TabType = "email" | "link";

const roleDescriptions: Record<CollaboratorRole, string> = {
  viewer: "Can view the project and its contents",
  editor: "Can view and edit the project",
  admin: "Can manage the project and its collaborators",
};

const roleIcons: Record<CollaboratorRole, typeof Shield> = {
  admin: Shield,
  editor: Edit3,
  viewer: Eye,
};

export function InviteDialog({
  open,
  onOpenChange,
  projectId,
  canCreateAdminInvites,
  onSuccess,
}: InviteDialogProps) {
  const [tab, setTab] = useState<TabType>("email");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setEmail("");
    setRole("editor");
    setMessage("");
    setError(null);
    setGeneratedLink(null);
    setCopied(false);
    setSuccess(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleEmailInvite = async () => {
    if (!email) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "email",
          email,
          role,
          message: message || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send invitation");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setError("Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "link",
          role,
          maxUses: 10,
          expiresInHours: 168, // 7 days
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to generate link");
        return;
      }

      setGeneratedLink(data.data.inviteUrl);
    } catch (err) {
      setError("Failed to generate link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError("Failed to copy link");
    }
  };

  const RoleIcon = roleIcons[role];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Collaborators</DialogTitle>
          <DialogDescription>
            Invite others to collaborate on this project
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "email"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setTab("email");
              setGeneratedLink(null);
              setError(null);
            }}
          >
            <Mail className="w-4 h-4" />
            Email Invite
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "link"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setTab("link");
              setError(null);
              setSuccess(false);
            }}
          >
            <Link2 className="w-4 h-4" />
            Share Link
          </button>
        </div>

        <div className="space-y-4 py-2">
          {/* Role selector */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as CollaboratorRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Viewer
                  </div>
                </SelectItem>
                <SelectItem value="editor">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Editor
                  </div>
                </SelectItem>
                {canCreateAdminInvites && (
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Admin
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <RoleIcon className="w-3 h-3" />
              {roleDescriptions[role]}
            </p>
          </div>

          {/* Email tab content */}
          {tab === "email" && (
            <>
              {success ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium">Invitation sent!</p>
                  <p className="text-xs text-muted-foreground">
                    An email has been sent to {email}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">
                      Message <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="message"
                      placeholder="Add a personal message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Link tab content */}
          {tab === "link" && (
            <>
              {generatedLink ? (
                <div className="space-y-3">
                  <Label>Shareable link</Label>
                  <div className="flex gap-2">
                    <Input
                      value={generatedLink}
                      readOnly
                      className="text-xs font-mono"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="shrink-0"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This link expires in 7 days and can be used up to 10 times.
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate a shareable link that anyone can use to join as a{" "}
                    <span className="font-medium">{role}</span>.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            {tab === "email" && !success && (
              <Button onClick={handleEmailInvite} disabled={loading || !email}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Invite
              </Button>
            )}
            {tab === "link" && !generatedLink && (
              <Button onClick={handleGenerateLink} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Generate Link
              </Button>
            )}
            {tab === "link" && generatedLink && (
              <Button onClick={() => onSuccess?.()}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
