import type { CollaboratorRole } from "@/lib/db/schema";

interface InvitationEmailParams {
  inviteUrl: string;
  projectName: string;
  inviterName: string;
  role: CollaboratorRole;
  message?: string;
  expiresAt: Date;
}

const roleDescriptions: Record<CollaboratorRole, string> = {
  viewer: "view the project and its contents",
  editor: "view and edit the project",
  admin: "manage the project and its collaborators",
};

const roleLabels: Record<CollaboratorRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
};

/**
 * Generate HTML email for project invitation
 */
export function getInvitationEmailHtml(params: InvitationEmailParams): string {
  const { inviteUrl, projectName, inviterName, role, message, expiresAt } = params;
  const expiresFormatted = expiresAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                🚀 AI Project Planner
              </h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">
                You've been invited to collaborate!
              </h2>

              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                <strong>${inviterName}</strong> has invited you to join the project
                <strong>"${projectName}"</strong> as a <strong>${roleLabels[role]}</strong>.
              </p>

              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #52525b;">
                As a ${roleLabels[role]}, you'll be able to ${roleDescriptions[role]}.
              </p>

              ${message ? `
              <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <p style="margin: 0 0 4px; font-size: 12px; font-weight: 500; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">
                  Message from ${inviterName}
                </p>
                <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #3f3f46; font-style: italic;">
                  "${message}"
                </p>
              </div>
              ` : ""}

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${inviteUrl}"
                       style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #71717a;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.5; color: #3b82f6; word-break: break-all;">
                ${inviteUrl}
              </p>

              <div style="padding: 16px; background-color: #fef3c7; border-radius: 8px;">
                <p style="margin: 0; font-size: 14px; color: #92400e;">
                  ⏰ This invitation expires on <strong>${expiresFormatted}</strong>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f4f4f5; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a; text-align: center;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 13px; color: #a1a1aa; text-align: center;">
                AI Project Planner - Intelligent Project Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for project invitation
 */
export function getInvitationEmailText(params: InvitationEmailParams): string {
  const { inviteUrl, projectName, inviterName, role, message, expiresAt } = params;
  const expiresFormatted = expiresAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
You've been invited to collaborate!

${inviterName} has invited you to join the project "${projectName}" as a ${roleLabels[role]}.

As a ${roleLabels[role]}, you'll be able to ${roleDescriptions[role]}.

${message ? `Message from ${inviterName}:\n"${message}"\n\n` : ""}Accept the invitation by visiting:
${inviteUrl}

⏰ This invitation expires on ${expiresFormatted}

If you didn't expect this invitation, you can safely ignore this email.

--
AI Project Planner - Intelligent Project Management
  `.trim();
}

/**
 * Get email subject for invitation
 */
export function getInvitationEmailSubject(projectName: string, inviterName: string): string {
  return `${inviterName} invited you to collaborate on "${projectName}"`;
}
