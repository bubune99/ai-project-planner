import nodemailer from "nodemailer";

// Lazy-initialize transporter to avoid errors during build
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// Default sender
const defaultFrom = process.env.EMAIL_FROM || "AI Project Planner <noreply@aiprojectplanner.com>";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email using Nodemailer
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, html, text, from, replyTo } = options;

  // Get transporter (lazy init)
  const mail = getTransporter();

  // Skip sending if SMTP is not configured
  if (!mail) {
    console.log("[Email] SMTP not configured, skipping email send");
    console.log("[Email] Would have sent:", { to, subject });
    return { success: true, id: "dev-mode-skipped" };
  }

  try {
    const info = await mail.sendMail({
      from: from || defaultFrom,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
      text,
      replyTo,
    });

    console.log("[Email] Sent successfully:", info.messageId);
    return { success: true, id: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] Error:", message);
    return { success: false, error: message };
  }
}

/**
 * Send a batch of emails
 */
export async function sendBatchEmails(
  emails: SendEmailOptions[]
): Promise<SendEmailResult[]> {
  // Get transporter (lazy init)
  const mail = getTransporter();

  // Skip if SMTP is not configured
  if (!mail) {
    console.log("[Email] SMTP not configured, skipping batch send");
    return emails.map(() => ({ success: true, id: "dev-mode-skipped" }));
  }

  // Send emails sequentially (nodemailer doesn't have native batch support)
  const results: SendEmailResult[] = [];

  for (const email of emails) {
    try {
      const info = await mail.sendMail({
        from: email.from || defaultFrom,
        to: Array.isArray(email.to) ? email.to.join(", ") : email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: email.replyTo,
      });
      results.push({ success: true, id: info.messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Email] Batch error:", message);
      results.push({ success: false, error: message });
    }
  }

  return results;
}
