import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP for rate-limiting — trusts the proxy-set header (Next.js runs behind one in every real deployment target). Falls back to a constant so rate limiting still degrades to "one shared bucket" rather than throwing. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = h.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
