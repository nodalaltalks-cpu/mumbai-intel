import type { UserPreferences } from "@prisma/client";

/** Pre-fetched, already-joined input to buildUserInterestSnapshot — the service layer (service.ts) does the querying; this stays a plain data shape. */
export interface UserInterferenceInput {
  publicUserId: string | null;
  preferences: UserPreferences | null;
  recentViewedProjects: { projectId: string; localityId: string; bedroomsList: number[]; viewedAt: Date }[];
  savedProjectIds: string[];
  compareEventProjectIds: string[];
  isReturningVisitor: boolean;
}
