import type { InfraType } from "@prisma/client";

/** A single infra point normalized from a connector, before dedupe/staging. */
export interface NormalizedInfraCandidate {
  type: InfraType;
  name: string;
  latitude: number;
  longitude: number;
  /** Idempotency key, e.g. "osm:node/123456". */
  sourceRef: string;
  detail?: string;
}

export interface ConnectorRunSummary {
  written: number;
  skipped: number;
  staged: number;
  failed: number;
}
