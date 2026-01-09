"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  Loader2,
  UserPlus,
  Shield,
  Edit3,
  Eye,
  Clock,
  Mail,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CollaboratorRole } from "@/lib/db/schema";

interface InviteAcceptClientProps {
  token: string;
  isLoggedIn: boolean;
}

interface InvitationData {
  valid: boolean;
  projectName: string;
  role: CollaboratorRole;
  inviterName: string;
  invitationType: "email" | "link";
  expiresAt: string;
  expectedEmail?: string;
  message?: string;
}

interface CanAcceptData {
  canAccept: boolean;
  reason?: string;
  errorCode?: string;
  projectName?: string;
  role?: CollaboratorRole;
  inviterName?: string;
  yourEmail?: string;
  expectedEmail?: string;
}

const roleIcons: Record<CollaboratorRole, typeof Shield> = {
  admin: Shield,
  editor: Edit3,
  viewer: Eye,
};

const roleLabels: Record<CollaboratorRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
};

const roleDescriptions: Record<CollaboratorRole, string> = {
  viewer: "View the project and its contents",
  editor: "View and edit the project",
  admin: "Manage the project and its collaborators",
};

const roleColors: Record<CollaboratorRole, string> = {
  admin: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  editor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  viewer: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export function InviteAcceptClient({ token, isLoggedIn }: InviteAcceptClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [canAcceptData, setCanAcceptData] = useState<CanAcceptData | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [acceptedProjectId, setAcceptedProjectId] = useState<string | null>(null);

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      try {
        const response = await fetch(`/api/invitations/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Invalid invitation");
          setLoading(false);
          return;
        }

        setInvitation(data.data);

        // If logged in, check if user can accept
        if (isLoggedIn) {
          const canAcceptResponse = await fetch(`/api/invitations/accept?token=${token}`);
          const canAcceptResult = await canAcceptResponse.json();

          if (canAcceptResponse.ok) {
            setCanAcceptData(canAcceptResult.data);
          }
        }
      } catch (err) {
        setError("Failed to load invitation");
      } finally {
        setLoading(false);
      }
    }

    fetchInvitation();
  }, [token, isLoggedIn]);

  // Accept invitation
  const handleAccept = async () => {
    setAccepting(true);
    setError(null);

    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to accept invitation");
        setAccepting(false);
        return;
      }

      setAccepted(true);
      setAcceptedProjectId(data.data.projectId);

      // Redirect to project after a short delay
      setTimeout(() => {
        router.push(`/project/${data.data.projectId}`);
      }, 2000);
    } catch (err) {
      setError("Failed to accept invitation");
      setAccepting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-gray-400">Loading invitation...</p>
      </div>
    );
  }

  // Error state (invalid/expired invitation)
  if (error && !invitation) {
    return (
      <Card className="max-w-md mx-auto p-8 bg-white/5 border-white/10">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Invalid Invitation</h1>
          <p className="text-gray-400">{error}</p>
          <Link href="/">
            <Button variant="outline" className="mt-4">
              Go to Homepage
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Accepted state
  if (accepted) {
    return (
      <Card className="max-w-md mx-auto p-8 bg-white/5 border-white/10">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to the team!</h1>
          <p className="text-gray-400">
            You've joined <span className="text-white font-medium">{invitation?.projectName}</span> as a{" "}
            <span className="text-white font-medium">{roleLabels[invitation?.role || "viewer"]}</span>.
          </p>
          <p className="text-sm text-gray-500">Redirecting to project...</p>
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      </Card>
    );
  }

  if (!invitation) return null;

  const RoleIcon = roleIcons[invitation.role];
  const canAccept = canAcceptData?.canAccept !== false;
  const expiresDate = new Date(invitation.expiresAt);
  const isExpiringSoon = expiresDate.getTime() - Date.now() < 24 * 60 * 60 * 1000; // Less than 24h

  return (
    <Card className="max-w-md mx-auto p-8 bg-white/5 border-white/10">
      <div className="flex flex-col items-center text-center gap-6">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
          <UserPlus className="w-8 h-8 text-blue-500" />
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">You're invited!</h1>
          <p className="text-gray-400">
            <span className="text-white font-medium">{invitation.inviterName}</span> has invited you to
            collaborate on a project.
          </p>
        </div>

        {/* Project info */}
        <div className="w-full p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-sm text-gray-500 mb-1">Project</p>
          <p className="text-xl font-semibold text-white">{invitation.projectName}</p>
        </div>

        {/* Role badge */}
        <div className="flex flex-col items-center gap-2">
          <Badge variant="outline" className={`${roleColors[invitation.role]} px-4 py-1.5 text-sm`}>
            <RoleIcon className="w-4 h-4 mr-2" />
            {roleLabels[invitation.role]}
          </Badge>
          <p className="text-xs text-gray-500">{roleDescriptions[invitation.role]}</p>
        </div>

        {/* Personal message */}
        {invitation.message && (
          <div className="w-full p-4 rounded-lg bg-white/5 border border-white/10 text-left">
            <p className="text-xs text-gray-500 mb-1">Message from {invitation.inviterName}</p>
            <p className="text-sm text-gray-300 italic">"{invitation.message}"</p>
          </div>
        )}

        {/* Expiration warning */}
        {isExpiringSoon && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <Clock className="w-4 h-4" />
            <span>Expires {expiresDate.toLocaleDateString()}</span>
          </div>
        )}

        {/* Email mismatch warning */}
        {isLoggedIn && !canAccept && canAcceptData?.errorCode === "EMAIL_MISMATCH" && (
          <div className="w-full p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm font-medium text-amber-400">Email mismatch</p>
                <p className="text-xs text-gray-400 mt-1">
                  This invitation was sent to{" "}
                  <span className="text-white">{canAcceptData.expectedEmail}</span>, but you're signed in
                  as <span className="text-white">{canAcceptData.yourEmail}</span>.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Sign in with the correct email to accept this invitation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Already a collaborator */}
        {isLoggedIn && !canAccept && canAcceptData?.errorCode === "ALREADY_COLLABORATOR" && (
          <div className="w-full p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm font-medium text-blue-400">Already a member</p>
                <p className="text-xs text-gray-400 mt-1">
                  You're already a collaborator on this project.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Is owner */}
        {isLoggedIn && !canAccept && canAcceptData?.errorCode === "IS_OWNER" && (
          <div className="w-full p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm font-medium text-blue-400">You own this project</p>
                <p className="text-xs text-gray-400 mt-1">
                  You're the owner of this project, so you don't need an invitation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full pt-2">
          {isLoggedIn ? (
            <>
              {canAccept ? (
                <Button
                  size="lg"
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  {accepting ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Check className="w-5 h-5 mr-2" />
                  )}
                  Accept Invitation
                </Button>
              ) : canAcceptData?.errorCode === "ALREADY_COLLABORATOR" || canAcceptData?.errorCode === "IS_OWNER" ? (
                <Link href="/dashboard" className="w-full">
                  <Button size="lg" className="w-full">
                    Go to Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href={`/sign-in?redirect=/invite/${token}`} className="w-full">
                  <Button size="lg" variant="outline" className="w-full">
                    Sign in with different account
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href={`/sign-up?redirect=/invite/${token}`} className="w-full">
                <Button size="lg" className="w-full bg-blue-500 hover:bg-blue-600">
                  <UserPlus className="w-5 h-5 mr-2" />
                  Sign Up to Accept
                </Button>
              </Link>
              <Link href={`/sign-in?redirect=/invite/${token}`} className="w-full">
                <Button size="lg" variant="outline" className="w-full">
                  Already have an account? Sign In
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Email invitation note */}
        {invitation.invitationType === "email" && invitation.expectedEmail && !isLoggedIn && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Mail className="w-3 h-3" />
            This invitation was sent to {invitation.expectedEmail}
          </p>
        )}
      </div>
    </Card>
  );
}
