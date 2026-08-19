import "server-only";
import { prisma } from "@/lib/prisma";

/** Reads one or more SiteSetting values by key — used both by the admin Settings page and, later, by anything that needs a configured value (e.g. the resolved-report review-request follow-up). Missing keys resolve to null, never throw. */
export async function getSiteSettings(keys: string[]): Promise<Record<string, string | null>> {
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((key) => [key, byKey.get(key) ?? null]));
}

export async function getSiteSetting(key: string): Promise<string | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}
