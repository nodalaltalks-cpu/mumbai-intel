import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export { REFERRAL_COOKIE_NAME, REFERRAL_COOKIE_MAX_AGE_SECONDS } from "./referral-constants";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids ambiguous codes when read aloud/typed
const CODE_LENGTH = 7;

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

/** Generates a unique referralCode for a new PublicUser — collisions are astronomically rare at this alphabet/length but retried defensively since the column is unique. */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const existing = await prisma.publicUser.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  // Vanishingly unlikely to be reached; falls back to a longer code that's effectively guaranteed unique.
  return `${randomCode()}${randomCode()}`;
}

export interface ResolvedReferral {
  referredByUserId: string;
  referralSource: string | null;
}

/**
 * Parses the mi_ref_code cookie's "code|channel" value and resolves the code
 * to the referring PublicUser's id. Returns null if there's no cookie, it's
 * malformed, or the code doesn't match anyone (a referral link for a
 * since-deleted account, or someone guessing a code) -- a bad code must
 * never fail or otherwise disrupt the signup it's attached to.
 */
export async function resolveReferral(cookieValue: string | undefined | null): Promise<ResolvedReferral | null> {
  if (!cookieValue) return null;
  const [code, channel] = cookieValue.split("|");
  if (!code) return null;
  const referrer = await prisma.publicUser.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer) return null;
  return { referredByUserId: referrer.id, referralSource: channel || null };
}
