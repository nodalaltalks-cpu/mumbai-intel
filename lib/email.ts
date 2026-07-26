import "server-only";

/**
 * Plain fetch call to the Resend API — no SDK dependency, consistent with the
 * rest of the codebase's "hand-rolled, no framework lock-in" style already
 * used for Google OAuth (see lib/public-auth/google.ts).
 *
 * Requires RESEND_API_KEY / EMAIL_FROM (see .env). Without them,
 * isEmailDeliveryConfigured() is false and sendEmail() falls back to logging
 * the message server-side, so the reset/contact flows stay fully testable
 * locally without an API key.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail(params: { to: string; subject: string; html: string; replyTo?: string }): Promise<void> {
  if (!isEmailDeliveryConfigured()) {
    console.log(`[email] Would send "${params.subject}" to ${params.to}:\n${params.html}`);
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[email] Resend send failed (${response.status}): ${body}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your Mumbai Intel password",
    html: `
      <p>We received a request to reset your Mumbai Intel password.</p>
      <p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 60 minutes.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendContactMessageEmail(params: { name: string; email: string; message: string }): Promise<void> {
  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    console.log(`[email] CONTACT_EMAIL is not set — would forward message from ${params.email}:\n${params.message}`);
    return;
  }
  await sendEmail({
    to,
    subject: `Mumbai Intel contact form — ${params.name}`,
    html: `
      <p><strong>From:</strong> ${escapeHtml(params.name)} (${escapeHtml(params.email)})</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>
    `,
    replyTo: params.email,
  });
}
