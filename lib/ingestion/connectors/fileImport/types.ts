import type { DataSource, ProjectStatus, PropertyCategory } from "@/lib/project-meta";

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
  reraStatus?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  status: ProjectStatus;
  category: PropertyCategory;
  totalUnits?: number;
  totalTowers?: number;
  priceMinRupees?: number;
  priceMaxRupees?: number;
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
