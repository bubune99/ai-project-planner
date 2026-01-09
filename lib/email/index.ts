export { sendEmail, sendBatchEmails, type SendEmailOptions, type SendEmailResult } from "./nodemailer";

export {
  getInvitationEmailHtml,
  getInvitationEmailText,
  getInvitationEmailSubject,
} from "./templates/invitation";

export {
  getCollaboratorJoinedEmailHtml,
  getCollaboratorJoinedEmailText,
  getCollaboratorJoinedEmailSubject,
} from "./templates/collaborator-joined";

import { sendEmail } from "./nodemailer";
import {
  getInvitationEmailHtml,
  getInvitationEmailText,
  getInvitationEmailSubject,
} from "./templates/invitation";
import {
  getCollaboratorJoinedEmailHtml,
  getCollaboratorJoinedEmailText,
  getCollaboratorJoinedEmailSubject,
} from "./templates/collaborator-joined";
import type { CollaboratorRole } from "@/lib/db/schema";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Send a project invitation email
 */
export async function sendInvitationEmail(params: {
  to: string;
  token: string;
  projectName: string;
  inviterName: string;
  role: CollaboratorRole;
  message?: string;
  expiresAt: Date;
}) {
  const { to, token, projectName, inviterName, role, message, expiresAt } = params;
  const inviteUrl = `${appUrl}/invite/${token}`;

  const emailParams = {
    inviteUrl,
    projectName,
    inviterName,
    role,
    message,
    expiresAt,
  };

  return sendEmail({
    to,
    subject: getInvitationEmailSubject(projectName, inviterName),
    html: getInvitationEmailHtml(emailParams),
    text: getInvitationEmailText(emailParams),
    tags: [
      { name: "type", value: "invitation" },
      { name: "role", value: role },
    ],
  });
}

/**
 * Send notification email when a collaborator joins a project
 */
export async function sendCollaboratorJoinedEmail(params: {
  to: string;
  recipientName: string;
  projectId: string;
  projectName: string;
  collaboratorName: string;
  collaboratorEmail: string;
  role: CollaboratorRole;
}) {
  const {
    to,
    recipientName,
    projectId,
    projectName,
    collaboratorName,
    collaboratorEmail,
    role,
  } = params;

  const projectUrl = `${appUrl}/projects/${projectId}`;

  const emailParams = {
    projectName,
    projectUrl,
    collaboratorName,
    collaboratorEmail,
    role,
    recipientName,
  };

  return sendEmail({
    to,
    subject: getCollaboratorJoinedEmailSubject(collaboratorName, projectName),
    html: getCollaboratorJoinedEmailHtml(emailParams),
    text: getCollaboratorJoinedEmailText(emailParams),
    tags: [
      { name: "type", value: "collaborator-joined" },
      { name: "role", value: role },
    ],
  });
}
