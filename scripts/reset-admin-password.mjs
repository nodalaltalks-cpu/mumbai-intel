import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import "dotenv/config";

/**
 * Mints a real password-reset link for an admin/founder (User table) account
 * without going through email delivery — same token shape and TTL as
 * requestPasswordResetAction in lib/actions/public-auth.ts, so the link this
 * prints validates in resetPasswordAction exactly like a normal emailed one.
 *
 * Exists because the app has no in-app "set admin password" screen, and
 * transactional email (Resend) isn't always configured/working in every
 * environment. This is the escape hatch for that case, not a replacement for
 * the emailed flow — prefer the normal /forgot-password page once email
 * delivery is confirmed working.
 *
 *   npm run reset-admin-password -- founder@example.com
 */

const RESET_TOKEN_TTL_MINUTES = 30;

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run reset-admin-password -- <email>");
    process.exitCode = 1;
    return;
  }

  const adapter = new PrismaNeonHttp(process.env.DATABASE_URL, {});
  const prisma = new PrismaClient({ adapter });

  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin || !admin.isActive) {
    console.error(`No active admin account found for ${email}`);
    process.exitCode = 1;
    return;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.adminPasswordResetToken.create({
    data: {
      userId: admin.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log(`${siteUrl}/reset-password?token=${token}`);
  console.log(`(valid ${RESET_TOKEN_TTL_MINUTES} minutes, single use)`);
}

main().catch((error) => {
  console.error("reset-admin-password failed:", error);
  process.exitCode = 1;
});
