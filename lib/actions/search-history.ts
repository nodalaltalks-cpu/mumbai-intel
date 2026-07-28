"use server";

import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";

/**
 * Server-persisted search history for logged-in users — distinct from
 * lib/recent-searches.ts's localStorage-only history for anonymous
 * visitors, which this never touches. No-ops silently when not signed in,
 * same "never block the page for this" rule as recordRecentViewAction.
 */
export async function recordSearchAction(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  const session = await getPublicSession();
  if (!session) return;

  try {
    const mostRecent = await prisma.searchHistory.findFirst({
      where: { publicUserId: session.userId },
      orderBy: { searchedAt: "desc" },
      select: { query: true },
    });
    // Skip if the immediately-preceding search was the exact same term (e.g. re-submitting the same box) — avoids noise, not a uniqueness guarantee across all history.
    if (mostRecent?.query === trimmed) return;

    await prisma.searchHistory.create({ data: { publicUserId: session.userId, query: trimmed } });
  } catch (error) {
    console.error("[search-history] failed to record search", trimmed, error);
  }
}

export async function clearSearchHistoryAction(): Promise<{ error?: string }> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage your search history." };
  await prisma.searchHistory.deleteMany({ where: { publicUserId: session.userId } });
  return {};
}
