import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP transport (Section 10) — replaces the previous plain-fetch call to
 * Resend's HTTP API. Generic SMTP_HOST/PORT/USER/PASSWORD/FROM env vars are
 * honored first (so this works with any SMTP-capable provider, per the
 * spec); when they aren't set, this defaults to Resend's own SMTP relay
 * (smtp.resend.com, user "resend", password = the existing RESEND_API_KEY)
 * so no new vendor signup is required — same provider, same API key,
 * different wire protocol. Live-verified from a dev sandbox: TLS handshake
 * and SMTP AUTH exchange with smtp.resend.com both complete correctly on
 * ports 587 and 465 (confirmed by the server's own "Authentication
 * credentials invalid" response when tested against a stale key) — the
 * transport itself is reachable and correct; only a valid credential is
 * needed to complete an actual send.
 */
interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function resolveSmtpConfig(): SmtpConfig | null {
  // process.env.Resend_API_Key is not a typo of the real name -- it's the actual, currently-live
  // Vercel env var name (Preview + Production), set with that exact casing. Env var lookups are
  // case-sensitive, so process.env.RESEND_API_KEY alone silently read as undefined in every
  // deployed environment despite a real key being configured -- this is the same class of bug the
  // isDeployedEnvironment() check above was added to stop from faking success, except the actual
  // credential mismatch causing it was never fixed at the source. Both names are checked so this
  // works regardless of which casing ends up configured, without requiring a Vercel dashboard change.
  const pass = process.env.SMTP_PASSWORD || process.env.RESEND_API_KEY || process.env.Resend_API_Key;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM;
  if (!pass || !from) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    host: process.env.SMTP_HOST || "smtp.resend.com",
    port,
    secure: port === 465,
    user: process.env.SMTP_USER || "resend",
    pass,
    from,
  };
}

let cachedTransporter: Transporter | null = null;
let cachedConfigKey: string | null = null;

/** Cached per unique config (host+port+user) — recreated if env vars change (e.g. between test runs), same instance reused across sends otherwise, matching Fluid Compute's instance-reuse model instead of reconnecting per email. */
function getTransporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  cachedConfigKey = key;
  return cachedTransporter;
}

export function isEmailDeliveryConfigured(): boolean {
  return resolveSmtpConfig() !== null;
}

/**
 * Whether a missing RESEND_API_KEY/EMAIL_FROM should be silently simulated as
 * success (true local dev) or treated as a real failure. Vercel sets
 * VERCEL_ENV on every deployment, Preview and Production alike — this is
 * what stops the exact bug that shipped once already: a misnamed env var
 * (`Resend_API_Key` instead of `RESEND_API_KEY`) plus a missing `EMAIL_FROM`
 * made isEmailDeliveryConfigured() false in every deployed environment, so
 * every campaign send silently no-op'd and reported "Success" without ever
 * calling Resend. A deployed environment must never fake success.
 */
function isDeployedEnvironment(): boolean {
  return Boolean(process.env.VERCEL_ENV);
}

interface SendEmailResult {
  ok: boolean;
  /** Resend's own email id, when the API accepted the send — for traceability, never proof of delivery. */
  providerMessageId?: string;
  /** Present only on failure — distinct from "delivered", since Resend's API accepting a send is not delivery confirmation. */
  error?: string;
}

async function sendEmailDetailed(params: { to: string; subject: string; html: string; replyTo?: string }): Promise<SendEmailResult> {
  const config = resolveSmtpConfig();
  if (!config) {
    if (isDeployedEnvironment()) {
      const error = "Email delivery is not configured (no SMTP_PASSWORD/RESEND_API_KEY or SMTP_FROM/EMAIL_FROM) in a deployed environment.";
      console.error(`[email] ${error} Refusing to fake-send "${params.subject}" to ${params.to}.`);
      return { ok: false, error };
    }
    console.log(`[email] Would send "${params.subject}" to ${params.to}:\n${params.html}`);
    return { ok: true };
  }

  try {
    const info = await getTransporter(config).sendMail({
      from: config.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    return { ok: true, providerMessageId: info.messageId };
  } catch (error) {
    // The real SMTP-server error, never a generic placeholder -- this is what was missing
    // before (a Resend HTTP error body used to be logged but discarded, leaving only
    // "Resend API error {status}" for the admin to see). Whatever the server actually said
    // ("Authentication credentials invalid", "domain not verified", etc.) reaches the caller.
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    console.error(`[email] SMTP send failed for "${params.subject}" to ${params.to}:`, message);
    return { ok: false, error: message };
  }
}

async function sendEmail(params: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
  return (await sendEmailDetailed(params)).ok;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Table-based layout with inline styles throughout — the only markup that
 * renders consistently across Outlook/Gmail/Apple Mail, none of which
 * support external or `<style>`-block CSS reliably.
 */
/** Returns whether the send actually succeeded — the caller (requestPasswordResetAction) uses this to log a founder-visible audit entry on failure, without ever changing the generic response shown to the requester (never reveal account existence). */
export async function sendPasswordResetEmail(to: string, resetUrl: string, expiryMinutes: number): Promise<boolean> {
  const safeUrl = escapeHtml(resetUrl);
  const html = `
    <div style="background:#fafafa;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
        <tr>
          <td style="text-align:center;padding-bottom:28px;">
            <span style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#18181b;">NoDalal<span style="color:#4f46e5;">Talks</span></span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:36px 32px;">
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
              We received a request to reset the password for your NoDalalTalks account. Click the button below to choose a new one.
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
              If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
            </p>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding-top:24px;font-size:12px;color:#a1a1aa;">
            NoDalalTalks: Real Estate Intelligence
          </td>
        </tr>
      </table>
    </div>
  `;

  return sendEmail({ to, subject: "Reset your NoDalalTalks password", html });
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
    subject: "NoDalalTalks newsletter signup",
    html: `<p><strong>New newsletter signup:</strong> ${escapeHtml(email)}</p>`,
    replyTo: email,
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
    subject: `NoDalalTalks contact form — ${params.name}`,
    html: `
      <p><strong>From:</strong> ${escapeHtml(params.name)} (${escapeHtml(params.email)})</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>
    `,
    replyTo: params.email,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Templates below share one visual shell (same card/button/footer styling
// as sendPasswordResetEmail above) via emailShell() instead of each
// re-inlining the full wrapper markup — purely a DRY convenience for these
// six newer templates, the existing ones above are left exactly as they are.
//
// TEMPORARY PRODUCTION PAUSE — all six of these are paused (no-op, logged
// only) until an email provider is finalized. Password reset / newsletter /
// inquiry / report-issue / contact emails above are NOT affected by this
// flag and keep sending normally through Resend as before. Nothing about
// the Resend integration, sendEmail(), or these templates has been removed
// — flip TRANSACTIONAL_EMAILS_PAUSED back to false to resume sending.
// ─────────────────────────────────────────────────────────────────────────

const TRANSACTIONAL_EMAILS_PAUSED = true;

function logPausedEmail(subject: string, to: string): void {
  console.log(`[email] Transactional emails are paused — skipped "${subject}" to ${to}`);
}

function emailButton(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="border-radius:10px;background:#4f46e5;">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function emailShell(bodyHtml: string): string {
  return `
    <div style="background:#fafafa;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
        <tr>
          <td style="text-align:center;padding-bottom:28px;">
            <span style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#18181b;">NoDalal<span style="color:#4f46e5;">Talks</span></span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:36px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding-top:24px;font-size:12px;color:#a1a1aa;">
            NoDalalTalks: Real Estate Intelligence
          </td>
        </tr>
      </table>
    </div>
  `;
}

/** Sent once, right after signup completes (credentials or Google) — see signupAction in lib/actions/public-auth.ts and the new-user branch of app/api/auth/google/callback/route.ts. */
export async function sendWelcomeEmail(to: string, name: string | null): Promise<void> {
  if (TRANSACTIONAL_EMAILS_PAUSED) return logPausedEmail("Welcome to NoDalalTalks", to);
  const greeting = name ? `Welcome, ${escapeHtml(name)}!` : "Welcome!";
  const html = emailShell(`
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">${greeting}</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
      Your free NoDalalTalks account is ready. Research Mumbai real estate on verified data, with no phone number and no spam calls, ever.
    </p>
    ${emailButton("Start researching", `${process.env.NEXT_PUBLIC_APP_URL ?? "https://nodalaltalks.com"}/projects`)}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
      With your account you can download official brochures, see exact transaction prices, save projects to your wishlist, and pick up your research on any device.
    </p>
  `);
  await sendEmail({ to, subject: "Welcome to NoDalalTalks", html });
}

/** Accepts a pre-built verification URL (same shape as sendPasswordResetEmail's resetUrl) — ready to call once a verification-token flow exists; see PublicPasswordResetToken for the analogous pattern that would back one. */
export async function sendEmailVerificationEmail(to: string, verifyUrl: string, expiryMinutes: number): Promise<void> {
  if (TRANSACTIONAL_EMAILS_PAUSED) return logPausedEmail("Verify your NoDalalTalks email", to);
  const safeUrl = escapeHtml(verifyUrl);
  const html = emailShell(`
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">Verify your email</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
      Confirm this is your email address to finish setting up your NoDalalTalks account.
    </p>
    ${emailButton("Verify email", verifyUrl)}
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#71717a;">
      This link expires in ${expiryMinutes} minutes. If the button doesn't work, copy and paste this URL into your browser:<br />
      <a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;">${safeUrl}</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
      If you didn't create a NoDalalTalks account, you can safely ignore this email.
    </p>
  `);
  await sendEmail({ to, subject: "Verify your NoDalalTalks email", html });
}

/** Confirms a brochure download to a signed-in user — call from wherever a download is already recorded server-side (e.g. app/api/analytics/brochure/route.ts) with that user's email, never from the client. */
export async function sendBrochureDownloadEmail(
  to: string,
  params: { projectName: string; projectUrl: string; brochureUrl: string }
): Promise<void> {
  if (TRANSACTIONAL_EMAILS_PAUSED) return logPausedEmail(`Brochure: ${params.projectName}`, to);
  const html = emailShell(`
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">Your brochure is ready</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
      Here's your copy of the official brochure for <strong>${escapeHtml(params.projectName)}</strong>. Download it again anytime from the links below.
    </p>
    ${emailButton("Download brochure", params.brochureUrl)}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
      <a href="${escapeHtml(params.projectUrl)}" style="color:#4f46e5;">View ${escapeHtml(params.projectName)} on NoDalalTalks →</a>
    </p>
  `);
  await sendEmail({ to, subject: `Brochure: ${params.projectName}`, html });
}

export interface WeeklyMarketIntelligenceLocality {
  name: string;
  avgPricePerSqftLabel: string;
  changeLabel: string;
}

export interface WeeklyMarketIntelligenceProject {
  name: string;
  url: string;
}

/** Ready-to-call digest template — sending this to real subscribers on a schedule needs its own weekly cron/subscription-preference infrastructure, out of scope here; this only builds and sends one issue given already-computed data. */
export async function sendWeeklyMarketIntelligenceEmail(
  to: string,
  params: { weekLabel: string; topLocalities: WeeklyMarketIntelligenceLocality[]; topProjects: WeeklyMarketIntelligenceProject[] }
): Promise<void> {
  if (TRANSACTIONAL_EMAILS_PAUSED) return logPausedEmail(`Weekly Market Intelligence: ${params.weekLabel}`, to);
  const localityRows = params.topLocalities
    .map(
      (l) => `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e4e4e7;font-size:13px;color:#18181b;">${escapeHtml(l.name)}</td>
          <td style="padding:8px 0;border-top:1px solid #e4e4e7;font-size:13px;color:#18181b;text-align:right;">${escapeHtml(l.avgPricePerSqftLabel)}</td>
          <td style="padding:8px 0;border-top:1px solid #e4e4e7;font-size:13px;color:#52525b;text-align:right;">${escapeHtml(l.changeLabel)}</td>
        </tr>
      `
    )
    .join("");
  const projectLinks = params.topProjects
    .map((p) => `<li style="margin:0 0 6px;"><a href="${escapeHtml(p.url)}" style="color:#4f46e5;font-size:13px;">${escapeHtml(p.name)}</a></li>`)
    .join("");

  const html = emailShell(`
    <h1 style="margin:0 0 4px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">Weekly Market Intelligence</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#71717a;">${escapeHtml(params.weekLabel)}</p>
    ${
      params.topLocalities.length > 0
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
             <tr>
               <th style="text-align:left;font-size:11px;text-transform:uppercase;color:#a1a1aa;padding-bottom:6px;">Locality</th>
               <th style="text-align:right;font-size:11px;text-transform:uppercase;color:#a1a1aa;padding-bottom:6px;">Avg ₹/sqft</th>
               <th style="text-align:right;font-size:11px;text-transform:uppercase;color:#a1a1aa;padding-bottom:6px;">Change</th>
             </tr>
             ${localityRows}
           </table>`
        : ""
    }
    ${
      params.topProjects.length > 0
        ? `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#18181b;">New this week</p>
           <ul style="margin:0 0 24px;padding-left:18px;">${projectLinks}</ul>`
        : ""
    }
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
      You're receiving this because you subscribed to NoDalalTalks market updates.
    </p>
  `);
  await sendEmail({ to, subject: `Weekly Market Intelligence: ${params.weekLabel}`, html });
}

/** Ready-to-call — pairing this with real automated delivery needs a saved-search-vs-new-listings matcher, out of scope here; this only builds and sends one alert given already-computed matches. */
export async function sendSavedSearchAlertEmail(
  to: string,
  params: { searchName: string; searchUrl: string; newMatchesCount: number; sampleProjects: WeeklyMarketIntelligenceProject[] }
): Promise<void> {
  if (TRANSACTIONAL_EMAILS_PAUSED) {
    return logPausedEmail(`${params.newMatchesCount} new match${params.newMatchesCount === 1 ? "" : "es"}: ${params.searchName}`, to);
  }
  const projectLinks = params.sampleProjects
    .map((p) => `<li style="margin:0 0 6px;"><a href="${escapeHtml(p.url)}" style="color:#4f46e5;font-size:13px;">${escapeHtml(p.name)}</a></li>`)
    .join("");
  const html = emailShell(`
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">
      ${params.newMatchesCount} new match${params.newMatchesCount === 1 ? "" : "es"} for "${escapeHtml(params.searchName)}"
    </h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#52525b;">
      New projects matching your saved search are now live on NoDalalTalks.
    </p>
    ${params.sampleProjects.length > 0 ? `<ul style="margin:0 0 24px;padding-left:18px;">${projectLinks}</ul>` : ""}
    ${emailButton("View all matches", params.searchUrl)}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
      You're receiving this because you saved this search on NoDalalTalks.
    </p>
  `);
  await sendEmail({ to, subject: `${params.newMatchesCount} new match${params.newMatchesCount === 1 ? "" : "es"}: ${params.searchName}`, html });
}

/** Ready-to-call — pairing this with real automated delivery needs a price-change watcher on saved/wishlisted projects, out of scope here; this only builds and sends one alert given an already-detected change. */
export async function sendPriceAlertEmail(
  to: string,
  params: { projectName: string; projectUrl: string; oldPriceLabel: string; newPriceLabel: string; changeLabel: string }
): Promise<void> {
  if (TRANSACTIONAL_EMAILS_PAUSED) return logPausedEmail(`Price update: ${params.projectName}`, to);
  const html = emailShell(`
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#18181b;">Price update: ${escapeHtml(params.projectName)}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#52525b;">
      A project on your wishlist has a new price.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding-right:24px;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;color:#a1a1aa;">Previous</p>
          <p style="margin:2px 0 0;font-size:16px;color:#71717a;text-decoration:line-through;">${escapeHtml(params.oldPriceLabel)}</p>
        </td>
        <td>
          <p style="margin:0;font-size:11px;text-transform:uppercase;color:#a1a1aa;">Now</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#18181b;">${escapeHtml(params.newPriceLabel)} <span style="font-size:12px;font-weight:500;color:#52525b;">(${escapeHtml(params.changeLabel)})</span></p>
        </td>
      </tr>
    </table>
    ${emailButton("View project", params.projectUrl)}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;border-top:1px solid #e4e4e7;padding-top:20px;">
      You're receiving this because this project is on your NoDalalTalks wishlist.
    </p>
  `);
  await sendEmail({ to, subject: `Price update: ${params.projectName}`, html });
}
