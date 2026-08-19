import "server-only";
import { logAudit } from "@/lib/audit";
import { on } from "../bus";

/**
 * Event-driven audit logging. For Project/Builder/Review events this
 * replaces a direct `logAudit(...)` call that used to sit inline in the
 * action — same `logAudit` function, same arguments, same resulting
 * AuditLog rows (the admin History panel is unaffected), just invoked via
 * subscription instead of a hardcoded call. For Media events this is a
 * genuinely new capability: media upload/delete previously had no audit
 * trail at all.
 */

on("ProjectCreated", async (p) => {
  await logAudit(p.actorId, "project.create", "Project", p.projectId);
});

on("ProjectUpdated", async (p) => {
  await logAudit(p.actorId, "project.update", "Project", p.projectId, { before: p.before, after: p.after });
});

on("ProjectPublished", async (p) => {
  await logAudit(p.actorId, "project.publish", "Project", p.projectId);
});

on("ProjectDeleted", async (p) => {
  await logAudit(p.actorId, "project.trash", "Project", p.projectId);
});

on("BuilderUpdated", async (p) => {
  await logAudit(p.actorId, "builder.update", "Builder", p.builderId, { before: p.before, after: p.after });
});

on("TransactionImported", async (p) => {
  await logAudit(p.actorId, "transaction.import", "Transaction", p.transactionId);
});

on("ReviewApproved", async (p) => {
  await logAudit(p.actorId, "ingest.approve", "IngestStagingRecord", p.stagingRecordId);
});

on("ReviewRejected", async (p) => {
  await logAudit(p.actorId, "ingest.reject", "IngestStagingRecord", p.stagingRecordId);
});

on("MediaUploaded", async (p) => {
  await logAudit(p.actorId, "media.upload", p.entityType, p.entityId, { after: { url: p.url, kind: p.kind } });
});

on("MediaDeleted", async (p) => {
  await logAudit(p.actorId, "media.delete", p.entityType, p.entityId, { before: { url: p.url } });
});

on("ReportStatusChanged", async (p) => {
  await logAudit(p.actorId, `report.${p.status.toLowerCase()}`, "Report", p.reportId, {
    before: { status: p.previousStatus },
    after: { status: p.status, ...(p.note ? { note: p.note } : {}) },
  });
});
