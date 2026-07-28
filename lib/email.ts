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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Table-based layout with inline styles throughout — the only markup that
 * renders consistently across Outlook/Gmail/Apple Mail, none of which
 * support external or `<style>`-block CSS reliably.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string, expiryMinutes: number): Promise<void> {
  const safeUrl = escapeHtml(resetUrl);
  const html = `
    <div style="background:#fafafa;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
        <tr>
          <td style="text-align:center;padding-bottom:28px;">
            <span style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#18181b;">Mumbai<span style="color:#4f46e5;">Intel</span></span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:36px 32px;">
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
              We received a request to reset the password for your Mumbai Intel account. Click the button below to choose a new one.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="border-radius:10px;background:#4f46e5;">
                  <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                    Reset password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#71717a;">
              This link expires in ${expiryMinutes} minutes. If the button doesn't work, copy and paste this URL into your browser:<br />
              <a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;">${safeUrl}</a>
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
              If you didn't request a password reset, you can safely ignore this email — your password will not be changed.
            </p>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding-top:24px;font-size:12px;color:#a1a1aa;">
            Mumbai Intel — Real Estate Intelligence
          </td>
        </tr>
      </table>
    </div>
  `;

  await sendEmail({ to, subject: "Reset your Mumbai Intel password", html });
}

/** Newsletter signups aren't persisted to a table today — this forwards the address the same way the contact form does, to the site's own inbox, so a real person adds it to the actual mailing list. */
export async function sendNewsletterSignupEmail(email: string): Promise<void> {
  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    console.log(`[email] CONTACT_EMAIL is not set — would forward newsletter signup from ${email}`);
    return;
  }
  await sendEmail({
    to,
    subject: "Mumbai Intel newsletter signup",
    html: `<p><strong>New newsletter signup:</strong> ${escapeHtml(email)}</p>`,
    replyTo: email,
  });
}

export async function sendProjectInquiryEmail(params: {
  name: string;
  email: string;
  phone?: string;
  message: string;
  projectName: string;
  projectUrl: string;
}): Promise<void> {
  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    console.log(`[email] CONTACT_EMAIL is not set — would forward developer inquiry for ${params.projectName} from ${params.email}`);
    return;
  }
  await sendEmail({
    to,
    subject: `Developer inquiry — ${params.projectName}`,
    html: `
      <p><strong>Project:</strong> ${escapeHtml(params.projectName)} (<a href="${escapeHtml(params.projectUrl)}">${escapeHtml(params.projectUrl)}</a>)</p>
      <p><strong>From:</strong> ${escapeHtml(params.name)} (${escapeHtml(params.email)})${params.phone ? ` · ${escapeHtml(params.phone)}` : ""}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>
    `,
    replyTo: params.email,
  });
}

export async function sendReportIssueEmail(params: {
  reporterName: string | null;
  reporterEmail: string | null;
  entityType: string;
  entityName: string;
  entityUrl: string;
  issue: string;
}): Promise<void> {
  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    console.log(`[email] CONTACT_EMAIL is not set — would forward a reported issue on ${params.entityType} "${params.entityName}"`);
    return;
  }
  await sendEmail({
    to,
    subject: `Data correction reported — ${params.entityType}: ${params.entityName}`,
    html: `
      <p><strong>${escapeHtml(params.entityType)}:</strong> ${escapeHtml(params.entityName)} (<a href="${escapeHtml(params.entityUrl)}">${escapeHtml(params.entityUrl)}</a>)</p>
      <p><strong>Reported by:</strong> ${params.reporterName ? escapeHtml(params.reporterName) : "Anonymous"}${params.reporterEmail ? ` (${escapeHtml(params.reporterEmail)})` : ""}</p>
      <p><strong>Issue:</strong></p>
      <p>${escapeHtml(params.issue).replace(/\n/g, "<br />")}</p>
    `,
    ...(params.reporterEmail ? { replyTo: params.reporterEmail } : {}),
  });
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
