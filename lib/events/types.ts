/**
 * The named domain events every module can emit or subscribe to. This is the
 * event vocabulary described in docs/governance-standards.md §4 — now backed
 * by real code instead of just an `AuditLog.action` naming convention.
 *
 * Adding a new event: add a key here with its payload shape, then `emit()`
 * it from the action where it happens. No central registry edit needed
 * beyond this file — subscribers register themselves independently.
 */

export interface EventPayloadMap {
  ProjectCreated: { projectId: string; slug: string; actorId: string | null };
  ProjectUpdated: {
    projectId: string;
    slug: string;
    actorId: string | null;
    before: unknown;
    after: unknown;
  };
  ProjectPublished: { projectId: string; slug: string; actorId: string | null };
  ProjectDeleted: { projectId: string; slug: string; actorId: string | null };

  BuilderUpdated: {
    builderId: string;
    slug: string;
    actorId: string | null;
    before: unknown;
    after: unknown;
  };

  /**
   * No current producer: Transaction bulk-import isn't built yet (CSV/JSON
   * import today only supports Project — see docs/feature-registry.md).
   * Defined now, subscribed to now, so the moment a Transaction importer
   * exists it's a one-line `emit()` call away from full wiring — nothing
   * else needs to change.
   */
  TransactionImported: { transactionId: string; batchId: string; actorId: string | null };

  ReviewApproved: {
    stagingRecordId: string;
    entityType: string;
    entityId: string | null;
    actorId: string | null;
  };
  ReviewRejected: { stagingRecordId: string; entityType: string; actorId: string | null };

  MediaUploaded: {
    entityType: "Project" | "Builder" | "Locality";
    entityId: string;
    url: string;
    kind: string;
    actorId: string | null;
  };
  MediaDeleted: {
    entityType: "Project" | "Builder" | "Locality";
    entityId: string;
    url: string;
    actorId: string | null;
  };

  /** A founder-admin reviewing a visitor-submitted "Report Inaccurate Information" changed its status. */
  ReportStatusChanged: {
    reportId: string;
    status: string;
    previousStatus: string;
    note?: string;
    entityType: string;
    entityId: string | null;
    actorId: string | null;
  };
}

export type EventName = keyof EventPayloadMap;
