"use client";

import { useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import type { EnrichmentConfidence, EnrichmentField } from "@/lib/enrichment/types";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";
import type { ResearchPlanResult, ResearchRunStatus } from "@/lib/actions/research";
import type { ResearchFinding } from "@/lib/enrichment/researchProvider";
import type { ResearchQuerySet } from "@/lib/enrichment/researchQueryGeneration";
import EnrichmentProposalPanel from "./EnrichmentProposalPanel";

/**
 * Targeted fix (Research Project UX) -- the founder-facing "Research
 * Project" surface, rebuilt around the ONLY research method actually
 * supported today: an interactive Claude + Chrome pass. Still a thin
 * wrapper, not a rebuilt proposal UI -- EnrichmentProposalPanel is reused
 * UNCHANGED, and every submitted finding still goes through the EXACT SAME
 * submitResearchFindingsAction / identity guard / classifier as before.
 *
 * Section 17's own framing, restated for this task: NOT_CONFIGURED is an
 * implementation detail, not an error -- the dialog leads with "Research
 * this project with Claude + Chrome" rather than a dead-end error state.
 */
const STOP_STATUS_COPY: Record<string, string> = {
  OUT_OF_SCOPE: "This project is outside Mumbai city -- research is Mumbai-city residential only.",
  NO_TARGET_FIELDS: "Every researchable field for this project is already resolved -- nothing left to research.",
  NOT_FOUND: "Staging record not found.",
  ERROR: "Research couldn't run for this record.",
};

/** Presentation-only labels for the internal registry field keys -- mirrors founderReviewFields.ts's own FOUNDER_FIELD_LABELS convention, kept local since research targets a slightly different key set (raw possessionMonth/possessionYear, not the merged "possession"). */
const FIELD_LABELS: Record<string, string> = {
  name: "Project Name",
  developerGroup: "Developer",
  locality: "Locality",
  microMarket: "Micro-market",
  status: "Status",
  category: "Category",
  address: "Address",
  priceMin: "Starting Price",
  reraNumber: "RERA Number",
  possessionMonth: "Possession Month",
  possessionYear: "Possession Year",
  description: "Description",
  highlights: "Highlights",
  amenities: "Amenities",
  developerWebsiteUrl: "Official Developer Website",
  coverImage: "Cover Image",
  brochure: "Brochure PDF",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** Flattens + de-duplicates every query across all target fields into one flat, founder-readable list (a raw per-field grouping would otherwise show the identical possession query twice, once for possessionMonth and once for possessionYear). */
function flattenQueries(querySets: ResearchQuerySet[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const set of querySets) {
    for (const q of set.queries) {
      if (seen.has(q)) continue;
      seen.add(q);
      out.push(q);
    }
  }
  return out;
}

const REQUIRED_OUTPUT_FORMAT = `Return your findings as a JSON array, one object per fact you found, using exactly this shape:

[
  {
    "field": "address",
    "proposedValue": "...",
    "sourceUrl": "https://...",
    "sourceTitle": "...",
    "sourceType": "OFFICIAL_DEVELOPER",
    "accessedAt": "2026-09-07T12:00:00.000Z",
    "evidence": "One or two sentences on what the page actually said and why it supports this value.",
    "confidence": "HIGH",
    "identitySignals": {
      "projectName": "...",
      "developer": "...",
      "reraNumber": "..."
    }
  }
]

Rules:
- "sourceType" must be one of: OFFICIAL_DEVELOPER, GOVERNMENT, VERIFIED_THIRD_PARTY, LISTING_PORTAL.
- "confidence" must be one of: HIGH, MEDIUM, LOW.
- For a list-shaped field like amenities, also add an "items" array, e.g. "items": ["Swimming Pool", "Gym"].
- Only include a finding when you found a real page with a real URL -- never guess. Omit a field entirely rather than inventing a value.
- "identitySignals" must reflect ONLY what actually appeared on the page you read -- never invent a project name, developer name, or RERA number.`;

function buildCopyText(task: NonNullable<ResearchPlanResult["task"]>): string {
  const lines: string[] = [];
  lines.push(`RESEARCH TASK -- ${task.project.name}`);
  lines.push("");
  lines.push("You are researching a Mumbai residential real-estate project. Read real web pages and report only what they actually say -- never guess, never fabricate a source.");
  lines.push("");
  lines.push("PROJECT");
  lines.push(`Name: ${task.project.name}`);
  if (task.project.developer) lines.push(`Developer: ${task.project.developer}`);
  if (task.project.locality) lines.push(`Locality: ${task.project.locality}`);
  if (task.project.reraNumber) lines.push(`RERA: ${task.project.reraNumber}`);
  lines.push("");
  lines.push("FIELDS TO RESEARCH");
  for (const key of task.targetFields) lines.push(`- ${fieldLabel(key)}`);
  lines.push("");
  lines.push("RESEARCH QUERIES");
  for (const q of flattenQueries(task.queries)) lines.push(`- ${q}`);
  lines.push("");
  lines.push("SOURCE PRIORITY");
  for (const rule of task.sourceRules) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("IDENTITY VERIFICATION RULES");
  for (const rule of task.identityRules) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("SAFETY RULES");
  for (const rule of task.safetyRules) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("INSTRUCTIONS");
  lines.push(task.instructions);
  lines.push("");
  lines.push("REQUIRED OUTPUT FORMAT");
  lines.push(REQUIRED_OUTPUT_FORMAT);
  return lines.join("\n");
}

function ResearchPlanSection({ task }: { task: NonNullable<ResearchPlanResult["task"]> }) {
  const [copied, setCopied] = useState(false);
  const queries = flattenQueries(task.queries);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText(task));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border p-3">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">Step 1 -- Research Plan</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted">Project</span>
          <span className="text-foreground">{task.project.name}</span>
          {task.project.developer ? (
            <>
              <span className="text-muted">Developer</span>
              <span className="text-foreground">{task.project.developer}</span>
            </>
          ) : null}
          {task.project.locality ? (
            <>
              <span className="text-muted">Locality</span>
              <span className="text-foreground">{task.project.locality}</span>
            </>
          ) : null}
          {task.project.reraNumber ? (
            <>
              <span className="text-muted">RERA</span>
              <span className="font-mono text-foreground">{task.project.reraNumber}</span>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">Fields to research</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {task.targetFields.map((key) => (
            <li key={key} className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-foreground">
              {fieldLabel(key)}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">Research queries</p>
        <ul className="mt-1 flex flex-col gap-1">
          {queries.map((q, i) => (
            <li key={i} className="text-[11px] text-muted">
              "{q}"
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">Step 2 -- Research with Claude + Chrome</p>
        <p className="text-[11px] text-muted">
          Copy the full research task below, paste it into a Claude + Chrome session, let it research the project on the web, then paste its structured
          findings back in Step 3.
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="w-fit rounded-sm border border-accent px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide text-accent hover:bg-accent/10"
        >
          {copied ? "✓ Research task copied" : "Copy research task"}
        </button>
      </div>
    </div>
  );
}

const VALID_SOURCE_TIERS = new Set(["GOVERNMENT", "OFFICIAL_DEVELOPER", "VERIFIED_THIRD_PARTY", "LISTING_PORTAL"]);

function normalizeConfidence(raw: unknown): EnrichmentConfidence {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "high") return "High";
  if (s === "low") return "Low";
  return "Medium";
}

function normalizeSourceType(raw: unknown): ResearchFinding["sourceType"] {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (VALID_SOURCE_TIERS.has(s) ? s : "LISTING_PORTAL") as ResearchFinding["sourceType"];
}

interface MapOutcome {
  ok: boolean;
  finding?: ResearchFinding;
  reason: string;
}

/**
 * Translates the simple, founder/Claude-facing JSON shape (Section 3's
 * schema: field/proposedValue/evidence/...) into the internal ResearchFinding
 * shape submitResearchFindingsAction already expects -- so the founder never
 * needs to know an internal TypeScript type exists. Lenient on purpose: also
 * accepts the internal field names directly (fieldKey/value/reasoning), so
 * findings collected before this UX change still paste in unchanged.
 */
function mapPastedFinding(raw: unknown, index: number): MapOutcome {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: `Entry ${index + 1} is not a JSON object.` };
  }
  const r = raw as Record<string, unknown>;
  const fieldKey = r.field ?? r.fieldKey;
  if (typeof fieldKey !== "string" || !fieldKey.trim()) {
    return { ok: false, reason: `Entry ${index + 1} is missing "field".` };
  }
  const items = Array.isArray(r.items) ? r.items.map((x) => String(x)) : undefined;
  const rawValue = r.proposedValue ?? r.value;
  const value = typeof rawValue === "string" && rawValue.trim() ? rawValue : items && items.length > 0 ? `${items.length} selected` : undefined;
  if (!value) {
    return { ok: false, reason: `"${fieldKey}" is missing "proposedValue".` };
  }
  const sourceUrl = r.sourceUrl;
  if (typeof sourceUrl !== "string" || !sourceUrl.trim()) {
    return { ok: false, reason: `"${fieldKey}" is missing "sourceUrl" -- a finding needs a real source.` };
  }
  const evidence = r.evidence ?? r.reasoning;
  if (typeof evidence !== "string" || !evidence.trim()) {
    return { ok: false, reason: `"${fieldKey}" is missing "evidence".` };
  }
  const signalsRaw = (r.identitySignals as Record<string, unknown>) ?? {};
  const pageProjectName = signalsRaw.projectName ?? signalsRaw.pageProjectName;
  const pageDeveloperName = signalsRaw.developer ?? signalsRaw.pageDeveloperName;
  const pageRera = signalsRaw.reraNumber ?? signalsRaw.pageRera;

  return {
    ok: true,
    reason: "",
    finding: {
      fieldKey,
      value,
      confidence: normalizeConfidence(r.confidence),
      sourceUrl,
      sourceType: normalizeSourceType(r.sourceType),
      reasoning: evidence,
      items,
      sourceTitle: typeof r.sourceTitle === "string" ? r.sourceTitle : undefined,
      accessedAt: typeof r.accessedAt === "string" ? r.accessedAt : undefined,
      identitySignals: {
        pageProjectName: typeof pageProjectName === "string" ? pageProjectName : undefined,
        pageDeveloperName: typeof pageDeveloperName === "string" ? pageDeveloperName : undefined,
        pageRera: typeof pageRera === "string" ? pageRera : undefined,
      },
    },
  };
}

function FindingsSubmitForm({
  onSubmit,
}: {
  onSubmit: (findings: ResearchFinding[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  async function handleSubmit() {
    setFeedback(null);
    setSkipped([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setFeedback("That's not valid JSON -- check for a missing comma or bracket.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setFeedback("Expected a non-empty JSON array of findings.");
      return;
    }
    const mapped = parsed.map((entry, i) => mapPastedFinding(entry, i));
    const findings = mapped.filter((m) => m.ok).map((m) => m.finding!);
    const skippedReasons = mapped.filter((m) => !m.ok).map((m) => m.reason);
    if (findings.length === 0) {
      setFeedback("None of the pasted entries could be understood -- see below.");
      setSkipped(skippedReasons);
      return;
    }
    setSubmitting(true);
    const result = await onSubmit(findings);
    setSubmitting(false);
    if (result.ok) {
      setRaw("");
      setFeedback(null);
      setSkipped(skippedReasons);
    } else {
      setFeedback(result.error ?? "Submission failed.");
      setSkipped(skippedReasons);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">Step 3 -- Paste Claude's findings</p>
      <p className="text-[11px] text-muted">
        Paste the JSON array Claude returned after researching this project. Every finding still passes through identity verification and classification
        below -- nothing here bypasses Founder Review.
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={8}
        placeholder={'[ { "field": "address", "proposedValue": "...", "sourceUrl": "...", "evidence": "...", "confidence": "HIGH", ... } ]'}
        className="w-full rounded-sm border border-border bg-background p-2 font-mono text-[11px] text-foreground"
      />
      {feedback ? <p className="text-[11px] text-negative">{feedback}</p> : null}
      {skipped.length > 0 ? (
        <div className="rounded-sm border border-warning/40 bg-warning/5 p-2">
          <p className="text-[10px] uppercase tracking-wide text-warning">
            {skipped.length} entr{skipped.length === 1 ? "y" : "ies"} could not be understood and {skipped.length === 1 ? "was" : "were"} skipped
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {skipped.map((s, i) => (
              <li key={i} className="text-[11px] text-muted">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[10px] uppercase tracking-wide text-muted pt-1">Step 4 -- Submit</p>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || raw.trim().length === 0}
        className="w-fit rounded-sm border border-accent px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide text-accent disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit research findings"}
      </button>
    </div>
  );
}

function ResultSummary({
  submittedCount,
  submittedFieldKeys,
  rejectedCount,
  conflictCount,
  noSourceCount,
}: {
  submittedCount: number;
  submittedFieldKeys: string[];
  rejectedCount: number;
  conflictCount: number;
  noSourceCount: number;
}) {
  const acceptedCount = Math.max(submittedCount - rejectedCount, 0);
  return (
    <div className="rounded-sm border border-positive/40 bg-positive/5 p-3">
      <p className="text-[10px] uppercase tracking-wide text-positive">Step 5 -- Research complete</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        <span className="text-muted">
          {submittedCount} finding{submittedCount === 1 ? "" : "s"} submitted
        </span>
        <span className="text-positive">{acceptedCount} accepted into review</span>
        <span className={rejectedCount > 0 ? "text-warning" : "text-muted"}>{rejectedCount} rejected by identity guard</span>
        <span className={conflictCount > 0 ? "text-negative" : "text-muted"}>{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</span>
        <span className="text-muted">
          {noSourceCount} no-source ({submittedFieldKeys.length} field{submittedFieldKeys.length === 1 ? "" : "s"} covered)
        </span>
      </div>
    </div>
  );
}

export default function ResearchDialog({
  title,
  loading,
  status,
  fields,
  error,
  rejectedFindings,
  planLoading,
  plan,
  onClose,
  onRetry,
  onSubmitFindings,
  onAcceptField,
  onRejectField,
  onUploadMedia,
  onViewHistory,
  onUndo,
}: {
  title: string;
  loading: boolean;
  status: ResearchRunStatus | null;
  fields: EnrichmentField[] | null;
  error: string | null;
  rejectedFindings?: { fieldKey: string; sourceUrl: string; reason: string }[];
  planLoading: boolean;
  plan: ResearchPlanResult | null;
  onClose: () => void;
  onRetry: () => void;
  onSubmitFindings: (findings: ResearchFinding[]) => Promise<{ ok: boolean; error?: string }>;
  onAcceptField: (
    field: EnrichmentField,
    editContext?: { founderEdited: true; overriddenValue: string | null; overriddenItems?: string[] },
    siblingPossessionValue?: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectField: (field: EnrichmentField, reason: string) => Promise<{ ok: boolean; error?: string }>;
  onUploadMedia: (
    fieldKey: string,
    file: File,
    editContext: { overriddenValue: string | null; overriddenItems?: string[]; sourceUrl: string | null }
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onViewHistory: (fieldKey: string) => Promise<EnrichmentHistoryEntry[]>;
  onUndo: (fieldKey: string, historyEventId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [lastSubmission, setLastSubmission] = useState<{ count: number; fieldKeys: string[]; targetFieldsAtSubmission: string[] } | null>(null);

  async function handleSubmitFindings(findings: ResearchFinding[]): Promise<{ ok: boolean; error?: string }> {
    setLastSubmission({
      count: findings.length,
      fieldKeys: [...new Set(findings.map((f) => f.fieldKey))],
      targetFieldsAtSubmission: plan?.task?.targetFields ?? [],
    });
    return onSubmitFindings(findings);
  }

  // Section separation, kept deliberately independent: the PLAN (steps 1-2) can
  // legitimately shrink to NO_TARGET_FIELDS right after a successful submission
  // (the field the founder just accepted is no longer "missing") -- that must
  // never hide the RESULT (step 5) the founder is currently looking at. Only a
  // genuine stop condition (out of scope / record not found / error) hides the
  // whole interactive workflow, since submitting findings makes no sense there.
  const hardStopStatus = plan && plan.status !== "SUCCESS" && plan.status !== "NO_TARGET_FIELDS" ? plan.status : null;
  const showPlanSection = plan?.status === "SUCCESS" && plan.task;
  const showPasteForm = !hardStopStatus && !loading && !planLoading;
  // fields can come from either path: a future automated ResearchProvider run
  // (status/fields straight from researchProjectAction, no lastSubmission set)
  // or this founder's own manual paste -- both must display, but only the
  // manual path has real submitted/rejected counts to show as Step 5 stats.
  const hasResult = Boolean(fields && fields.length > 0);

  const noSourceCount =
    hasResult && lastSubmission ? lastSubmission.targetFieldsAtSubmission.filter((k) => !lastSubmission.fieldKeys.includes(k)).length : 0;
  const conflictCount =
    hasResult && lastSubmission ? fields!.filter((f) => lastSubmission.fieldKeys.includes(f.key) && f.classification === "CONFLICT").length : 0;

  return (
    <Dialog title={`Research: ${title}`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4">
        {loading || planLoading ? <p className="text-xs text-muted">Preparing research plan...</p> : null}

        {!loading && !planLoading && hardStopStatus ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">{STOP_STATUS_COPY[hardStopStatus] ?? plan?.error ?? error ?? "Research couldn't run for this record."}</p>
            {hardStopStatus === "ERROR" || hardStopStatus === "NOT_FOUND" ? (
              <button
                type="button"
                onClick={onRetry}
                className="w-fit rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !planLoading && !hardStopStatus ? (
          <>
            <div>
              <p className="text-sm font-medium text-foreground">Research this project with Claude + Chrome</p>
              <p className="mt-1 text-xs text-muted">
                No automated search provider is configured in this environment -- that's expected, not an error. The interactive Claude + Chrome workflow
                below is the currently supported way to research this project.
              </p>
            </div>

            {showPlanSection ? (
              <ResearchPlanSection task={plan!.task!} />
            ) : (
              <p className="text-xs text-muted">{STOP_STATUS_COPY.NO_TARGET_FIELDS}</p>
            )}

            {hasResult && lastSubmission ? (
              <ResultSummary
                submittedCount={lastSubmission.count}
                submittedFieldKeys={lastSubmission.fieldKeys}
                rejectedCount={rejectedFindings?.length ?? 0}
                conflictCount={conflictCount}
                noSourceCount={noSourceCount}
              />
            ) : hasResult && status === "SUCCESS" ? (
              <p className="text-xs text-positive">Research results ready.</p>
            ) : null}

            {rejectedFindings && rejectedFindings.length > 0 ? (
              <div className="rounded-sm border border-warning/40 bg-warning/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-warning">
                  {rejectedFindings.length} finding{rejectedFindings.length === 1 ? "" : "s"} could not be verified and were not included
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {rejectedFindings.map((r, i) => (
                    <li key={i} className="text-[11px] text-muted">
                      <span className="font-mono text-foreground">{r.fieldKey}</span> —{" "}
                      <span className="break-all">{r.sourceUrl || "(no source)"}</span>: {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {fields && fields.length > 0 ? (
              <EnrichmentProposalPanel
                fields={fields}
                onAcceptField={onAcceptField}
                onRejectField={onRejectField}
                onUploadMedia={onUploadMedia}
                onViewHistory={onViewHistory}
                onUndo={onUndo}
              />
            ) : null}

            {showPasteForm ? <FindingsSubmitForm onSubmit={handleSubmitFindings} /> : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
