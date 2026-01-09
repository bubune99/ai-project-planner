import type { CollaboratorRole } from "@/lib/db/schema";

interface CollaboratorJoinedEmailParams {
  projectName: string;
  projectUrl: string;
  collaboratorName: string;
  collaboratorEmail: string;
  role: CollaboratorRole;
  recipientName: string;
}

const roleLabels: Record<CollaboratorRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
};

/**
 * Generate HTML email for collaborator joined notification
 */
export function getCollaboratorJoinedEmailHtml(params: CollaboratorJoinedEmailParams): string {
  const { projectName, projectUrl, collaboratorName, collaboratorEmail, role, recipientName } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Collaborator Joined</title>
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
                New collaborator joined your project
              </h2>

              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                Hi ${recipientName},
              </p>

              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                <strong>${collaboratorName}</strong> (${collaboratorEmail}) has joined
                <strong>"${projectName}"</strong> as a <strong>${roleLabels[role]}</strong>.
              </p>

              <div style="margin: 0 0 24px; padding: 20px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 0;">
                      <p style="margin: 0 0 8px; font-size: 14px; color: #166534;">
                        ✓ ${collaboratorName} can now access the project
                      </p>
                      <p style="margin: 0; font-size: 14px; color: #166534;">
                        ✓ Role: <strong>${roleLabels[role]}</strong>
                      </p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${projectUrl}"
                       style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
                      View Project
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f4f4f5; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #71717a; text-align: center;">
                You received this email because you're the owner or admin of "${projectName}".
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
 * Generate plain text email for collaborator joined notification
 */
export function getCollaboratorJoinedEmailText(params: CollaboratorJoinedEmailParams): string {
  const { projectName, projectUrl, collaboratorName, collaboratorEmail, role, recipientName } = params;

  return `
New collaborator joined your project

Hi ${recipientName},

${collaboratorName} (${collaboratorEmail}) has joined "${projectName}" as a ${roleLabels[role]}.

✓ ${collaboratorName} can now access the project
✓ Role: ${roleLabels[role]}

View the project at:
${projectUrl}

--
You received this email because you're the owner or admin of "${projectName}".

AI Project Planner - Intelligent Project Management
  `.trim();
}

/**
 * Get email subject for collaborator joined notification
 */
export function getCollaboratorJoinedEmailSubject(collaboratorName: string, projectName: string): string {
  return `${collaboratorName} joined "${projectName}"`;
}
