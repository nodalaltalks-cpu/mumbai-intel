import type { Confidence, DataSource, ProjectStatus, PropertyCategory } from "@/lib/project-meta";

/**
 * What gets stored as IngestStagingRecord.payload for a Project file-import
 * candidate — plain JSON-serializable data (dates as ISO strings, since
 * Prisma's Json type can't hold a Date). lib/actions/ingestion.ts's approve
 * path reconstructs the exact shape lib/actions/projects.ts's
 * buildProjectData() expects from this.
 */
export interface ProjectImportPayload {
  name: string;
  reraNumber?: string;
  address?: string;
  status: ProjectStatus;
  category: PropertyCategory;
  totalUnits?: number;
  totalTowers?: number;
  priceMinRupees?: number;
  possessionDateIso?: string;
  launchDateIso?: string;
  builderId?: string;
  developerGroup?: string;
  localityId: string;
  description?: string;
  dataSource: DataSource;
  /** RERA number when present (a real external identifier), else a synthetic "sourceKey:row-N" traceability tag. */
  sourceRef: string;
}

/** What gets stored as IngestStagingRecord.payload for a Builder file-import candidate. */
export interface BuilderImportPayload {
  name: string;
  headquarters?: string;
  foundedYear?: number;
  websiteUrl?: string;
  reraNumber?: string;
  description?: string;
  logoUrl?: string;
  dataSource: DataSource;
  sourceRef: string;
}

/** What gets stored as IngestStagingRecord.payload for a Locality file-import candidate. */
export interface LocalityImportPayload {
  name: string;
  pincode?: string;
  description?: string;
  centroidLat?: number;
  centroidLng?: number;
  avgPriceRupeesPerSqft?: number;
  rentalYieldPercent?: number;
  connectivityNotes?: string;
  dataSource: DataSource;
  sourceRef: string;
}

/** What gets stored as IngestStagingRecord.payload for a Transaction file-import candidate — localityId/projectId are already resolved from the row's locality/project name at staging time, the same way ProjectImportPayload.builderId is resolved. */
export interface TransactionImportPayload {
  localityId: string;
  projectId?: string;
  type: "SALE" | "RESALE" | "LEASE";
  registrationDateIso: string;
  valueRupees: number;
  carpetSqft?: number;
  bedrooms?: number;
  tower?: string;
  unitLabel?: string;
  dataSource: DataSource;
  sourceRef: string;
  /** Real-world confidence in this row's own values (e.g. a hand-typed IGR entry vs. a verified deal sheet) — distinct from the batch-level `dataSource`. Optional: falls back to the Transaction schema's own MEDIUM default when absent. */
  confidence?: Confidence;
  /** Free-text note on where a manual/IGR figure came from — maps directly to `Transaction.sourceNote`. */
  sourceNote?: string;
}
