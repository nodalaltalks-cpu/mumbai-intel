"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { applyFounderEditAuthority, classifyProjectEnrichment, suppressPreviouslyRejectedProposals } from "@/lib/enrichment/classifyEnrichment";
import { resolveDeveloperDomain } from "@/lib/enrichment/developerDomainRegistry";
import { applyAcceptedField } from "@/lib/enrichment/applyAcceptedField";
import { buildEntityMatchProposal, resolveBuilderMatch, resolveLocalityMatch, type EntityMatchProposal } from "@/lib/enrichment/resolveNamedEntity";
import { resolveSavedDeveloperWebsite } from "@/lib/enrichment/developerWebsite";
import {
  actionTypeToStoredAction,
  applyStorableChanges,
  computePayloadDiff,
  determineAcceptActionType,
  ENRICHMENT_HISTORY_ENTITY_TYPE,
  getEnrichmentFieldHistory,
  getMostRecentEnrichmentEventsByField,
  getMostRecentEnrichmentHistoryEvent,
  toStorableChanges,
  type EnrichmentHistoryEntry,
  type EnrichmentHistorySnapshot,
} from "@/lib/enrichment/enrichmentHistory";
import { godrejPropertiesAdapter, GODREJ_SKY_SHORE_PROJECT_URL } from "@/lib/enrichment/adapters/godrejPropertiesAdapter";
import { adaniRealtyAdapter, ADANI_LINKBAY_RESIDENCES_PROJECT_URL } from "@/lib/enrichment/adapters/adaniRealtyAdapter";
import { kalpataruAdapter, KALPATARU_VIAN_PROJECT_URL } from "@/lib/enrichment/adapters/kalpataruAdapter";
import { gurukrupaRealconAdapter, GURUKRUPA_EKAM_PROJECT_URL } from "@/lib/enrichment/adapters/gurukrupaRealconAdapter";
import { puravankaraAdapter, PURVA_ESTRELLA_PROJECT_URL } from "@/lib/enrichment/adapters/puravankaraAdapter";
import { lodhaAdapter, LODHA_CULLINAN_PROJECT_URL } from "@/lib/enrichment/adapters/lodhaAdapter";
import { oberoiRealtyAdapter, OBEROI_SKY_HEIGHTS_PROJECT_URL, OBEROI_SPRINGS_PROJECT_URL } from "@/lib/enrichment/adapters/oberoiRealtyAdapter";
import { koltePatilAdapter, KOLTE_PATIL_SERENOVA_PROJECT_URL } from "@/lib/enrichment/adapters/koltePatilAdapter";
import { runwalRealtyAdapter, RUNWAL_SANCTUARY_PROJECT_URL } from "@/lib/enrichment/adapters/runwalRealtyAdapter";
import {
  rustomjeeAdapter,
  RUSTOMJEE_OCEAN_VISTA_PROJECT_URL,
  RUSTOMJEE_BALMORAL_GOLFLINKS_PROJECT_URL,
  RUSTOMJEE_ASHIANA_JUHU_PROJECT_URL,
  RUSTOMJEE_PARISHRAM_BANDRA_PROJECT_URL,
  RUSTOMJEE_CROWN_PRABHADEVI_PROJECT_URL,
  RUSTOMJEE_PRIVE_BKC_PROJECT_URL,
  RUSTOMJEE_ELEMENTS_JUHU_PROJECT_URL,
  RUSTOMJEE_ELITA_JUHU_PROJECT_URL,
  RUSTOMJEE_SEASONS_BANDRA_BKC_PROJECT_URL,
  RUSTOMJEE_ADEN_BANDRA_BKC_PROJECT_URL,
  RUSTOMJEE_CLEON_BKC_PROJECT_URL,
  RUSTOMJEE_STELLA_BANDRA_PROJECT_URL,
  RUSTOMJEE_VISTA_BAY_PAREL_PROJECT_URL,
  RUSTOMJEE_7_JVPD_PROJECT_URL,
  RUSTOMJEE_9_JVPD_PROJECT_URL,
  RUSTOMJEE_CLIFF_TOWER_PROJECT_URL,
  OZONE_SKYE_GOREGAON_WEST_PROJECT_URL,
} from "@/lib/enrichment/adapters/rustomjeeAdapter";
import { sunteckAdapter, SUNTECK_4TH_AVENUE_PROJECT_URL, SUNTECK_ALTAVIA_PROJECT_URL } from "@/lib/enrichment/adapters/sunteckAdapter";
import {
  shapoorjiPallonjiAdapter,
  SP_HEARTLAND_PROJECT_URL,
  SP_THE_ODYSSEY_PROJECT_URL,
  SP_NINE_ARCS_PROJECT_URL,
  SP_BKC_9_PROJECT_URL,
  SP_BKC_28_PROJECT_URL,
  SP_CODENAME_NP_1_2_PROJECT_URL,
} from "@/lib/enrichment/adapters/shapoorjiPallonjiAdapter";
import { piramalRealtyAdapter, PIRAMAL_MAHALAXMI_PROJECT_URL, PIRAMAL_ARANYA_PROJECT_URL, PIRAMAL_REVANTA_PROJECT_URL } from "@/lib/enrichment/adapters/piramalRealtyAdapter";
import { resolveProjectSource, type DeveloperSource } from "@/lib/enrichment/projectSourceResolution";
import {
  buildEnrichmentSummary,
  deriveEnrichmentBadge,
  readEnrichmentSummary,
  withFieldTouched,
  type EnrichmentBadgeInfo,
  type ProjectEnrichmentStatus,
} from "@/lib/enrichment/enrichmentSummary";
import type { EnrichmentField } from "@/lib/enrichment/types";
import { buildProjectReviewCompleteness, type ReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import { computeApprovalReadiness, type ApprovalReadinessResult } from "@/lib/ingestion/projectApprovalReadiness";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";
import type { Prisma } from "@prisma/client";
import { uploadDocumentFile, uploadImageFile } from "@/lib/cloudinary";

export type EnrichProjectStatus = "SUCCESS" | "NO_SOURCE" | "SOURCE_UNAVAILABLE" | "NO_NEW_INFO" | "ERROR";

export interface EnrichProjectResult {
  status: EnrichProjectStatus;
  fields?: EnrichmentField[];
  /** Phase 33 -- only present when the source produced a developerGroup/locality name to try resolving against the existing Builder/Locality tables. Never creates a row; see resolveNamedEntity.ts. */
  builderMatch?: EntityMatchProposal;
  localityMatch?: EntityMatchProposal;
  error?: string;
  /** Present whenever persistEnrichmentSummary succeeded -- see ProjectReviewSnapshot's own doc comment. */
  snapshot?: ProjectReviewSnapshot;
}

/**
 * The curated developer-domain -> {adapter, known projects} mapping this MVP
 * knows (Phase 29 Part G, extended developer-by-developer through Phase 42).
 *
 * Phase 43: replaces the earlier one-project-per-domain assumption. Proven
 * wrong by actually re-running the EXISTING Adani and Gurukrupa Realcon
 * adapters against a SECOND real project page each (Western Heights;
 * Gurukrupa Maurya/Dhyanam) -- every adapter's extraction logic already
 * generalizes across a developer's own projects (it reads whatever URL it's
 * given, never hardcodes one project's name), so the bottleneck was purely
 * this map's shape. One adapter is still shared per developer (same CMS
 * across that developer's own site); `projects` now holds every
 * hand-verified project this MVP knows for that developer, and
 * `sitemapUrl` (also hand-confirmed reachable) lets resolveProjectSource
 * fall back to live, exact-slug-match discovery for a project not yet
 * curated here -- see lib/enrichment/projectSourceResolution.ts for the
 * full resolution pipeline and its Part D wrong-project safety guarantee.
 */
const CURATED_SOURCES: Record<string, DeveloperSource> = {
  "https://www.godrejproperties.com": {
    adapter: godrejPropertiesAdapter,
    projects: { "godrej sky shore": GODREJ_SKY_SHORE_PROJECT_URL, "godrej skyshore": GODREJ_SKY_SHORE_PROJECT_URL },
    sitemapUrl: "https://www.godrejproperties.com/property-sitemap.xml",
  },
  "https://www.adanirealty.com": {
    adapter: adaniRealtyAdapter,
    projects: {
      "linkbay residences": ADANI_LINKBAY_RESIDENCES_PROJECT_URL,
      "adani linkbay residences": ADANI_LINKBAY_RESIDENCES_PROJECT_URL,
      "western heights": "https://www.adanirealty.com/residential-projects/mumbai/western-heights",
      "adani western heights": "https://www.adanirealty.com/residential-projects/mumbai/western-heights",
    },
    sitemapUrl: "https://www.adanirealty.com/sitemap.xml",
  },
  "https://www.kalpataru.com": {
    adapter: kalpataruAdapter,
    projects: { "kalpataru vian": KALPATARU_VIAN_PROJECT_URL },
    sitemapUrl: "https://www.kalpataru.com/sitemap.xml",
  },
  "https://gurukruparealcon.com": {
    adapter: gurukrupaRealconAdapter,
    projects: {
      "gurukrupa ekam": GURUKRUPA_EKAM_PROJECT_URL,
      "gurukrupa maurya": "https://gurukruparealcon.com/projects/gurukrupa-maurya",
      "gurukrupa dhyanam": "https://gurukruparealcon.com/projects/gurukrupa-dhyanam",
      // Phase 51 -- two more real, verified-active Gurukrupa Realcon
      // projects (confirmed "Under Construction" + real RERA on the
      // developer's own site), reusing the SAME existing adapter -- zero
      // new engineering, exactly Part F's "developer -> adapter -> many
      // project URLs" model.
      "gurukrupa aatman": "https://gurukruparealcon.com/projects/gurukrupa-aatman",
      "gurukrupa alaknanda": "https://gurukruparealcon.com/projects/gurukrupa-alaknanda",
    },
    sitemapUrl: "https://gurukruparealcon.com/sitemap.xml",
  },
  "https://www.puravankara.com": {
    adapter: puravankaraAdapter,
    projects: { "purva estrella": PURVA_ESTRELLA_PROJECT_URL },
    sitemapUrl: "https://www.puravankara.com/sitemap.xml",
  },
  "https://www.lodhagroup.com": {
    adapter: lodhaAdapter,
    projects: { "lodha cullinan": LODHA_CULLINAN_PROJECT_URL },
    sitemapUrl: "https://www.lodhagroup.com/sitemap.xml",
  },
  // Phase 47 -- seventh developer, both hand-verified against oberoirealty.com's
  // own sitemap as real Andheri West residential projects.
  "https://www.oberoirealty.com": {
    adapter: oberoiRealtyAdapter,
    projects: {
      "oberoi sky heights": OBEROI_SKY_HEIGHTS_PROJECT_URL,
      "oberoi springs": OBEROI_SPRINGS_PROJECT_URL,
    },
    sitemapUrl: "https://www.oberoirealty.com/sitemap.xml",
  },
  "https://www.koltepatil.com": {
    adapter: koltePatilAdapter,
    projects: { "serenova": KOLTE_PATIL_SERENOVA_PROJECT_URL },
    sitemapUrl: "https://www.koltepatil.com/sitemap.xml",
  },
  "https://runwalrealty.com": {
    adapter: runwalRealtyAdapter,
    projects: { "runwal sanctuary": RUNWAL_SANCTUARY_PROJECT_URL },
    sitemapUrl: "https://runwalrealty.com/residential-ongoing-sitemap.xml",
  },
  // Phase 49 -- 16 hand-verified real Mumbai residential projects, each
  // individually confirmed against rustomjee.com's own sitemap-projects.xml
  // and real page content (name/locality/RERA where present).
  "https://www.rustomjee.com": {
    adapter: rustomjeeAdapter,
    projects: {
      "rustomjee ocean vista": RUSTOMJEE_OCEAN_VISTA_PROJECT_URL,
      "rustomjee balmoral golflinks": RUSTOMJEE_BALMORAL_GOLFLINKS_PROJECT_URL,
      "rustomjee balmoral golf links": RUSTOMJEE_BALMORAL_GOLFLINKS_PROJECT_URL,
      "rustomjee ashiana": RUSTOMJEE_ASHIANA_JUHU_PROJECT_URL,
      "rustomjee ashiana juhu": RUSTOMJEE_ASHIANA_JUHU_PROJECT_URL,
      "rustomjee parishram": RUSTOMJEE_PARISHRAM_BANDRA_PROJECT_URL,
      "rustomjee crown": RUSTOMJEE_CROWN_PRABHADEVI_PROJECT_URL,
      "rustomjee crown prabhadevi": RUSTOMJEE_CROWN_PRABHADEVI_PROJECT_URL,
      "rustomjee prive": RUSTOMJEE_PRIVE_BKC_PROJECT_URL,
      "rustomjee prive bkc annexe": RUSTOMJEE_PRIVE_BKC_PROJECT_URL,
      "rustomjee elements": RUSTOMJEE_ELEMENTS_JUHU_PROJECT_URL,
      "rustomjee elements juhu": RUSTOMJEE_ELEMENTS_JUHU_PROJECT_URL,
      "rustomjee elita": RUSTOMJEE_ELITA_JUHU_PROJECT_URL,
      "rustomjee elita juhu": RUSTOMJEE_ELITA_JUHU_PROJECT_URL,
      "rustomjee seasons": RUSTOMJEE_SEASONS_BANDRA_BKC_PROJECT_URL,
      "rustomjee seasons bandra bkc": RUSTOMJEE_SEASONS_BANDRA_BKC_PROJECT_URL,
      "rustomjee aden": RUSTOMJEE_ADEN_BANDRA_BKC_PROJECT_URL,
      "rustomjee aden bandra": RUSTOMJEE_ADEN_BANDRA_BKC_PROJECT_URL,
      "rustomjee cleon": RUSTOMJEE_CLEON_BKC_PROJECT_URL,
      "rustomjee cleon bkc": RUSTOMJEE_CLEON_BKC_PROJECT_URL,
      "rustomjee stella": RUSTOMJEE_STELLA_BANDRA_PROJECT_URL,
      "rustomjee stella bandra": RUSTOMJEE_STELLA_BANDRA_PROJECT_URL,
      "rustomjee vista bay": RUSTOMJEE_VISTA_BAY_PAREL_PROJECT_URL,
      "vista bay parel": RUSTOMJEE_VISTA_BAY_PAREL_PROJECT_URL,
      "rustomjee 7 jvpd": RUSTOMJEE_7_JVPD_PROJECT_URL,
      "rustomjee 9 jvpd": RUSTOMJEE_9_JVPD_PROJECT_URL,
      "rustomjee cliff tower": RUSTOMJEE_CLIFF_TOWER_PROJECT_URL,
      "ozone skye": OZONE_SKYE_GOREGAON_WEST_PROJECT_URL,
      "ozone skye goregaon west": OZONE_SKYE_GOREGAON_WEST_PROJECT_URL,
      "rustomjee ozone skye": OZONE_SKYE_GOREGAON_WEST_PROJECT_URL,
    },
    sitemapUrl: "https://www.rustomjee.com/sitemap-projects.xml",
  },
  // Phase 52 -- 11th developer. Only 2 of Sunteck's own 16 current Mumbai-area
  // project pages resolve to an existing Mumbai-CITY Locality (both Goregaon
  // West); the rest (BKC/Andheri West pages) are already Occupancy-Certificate
  // "OC Received"/complete, and several more (Mira Road, Naigaon, Vasai,
  // Kalyan, Airoli) sit outside Mumbai city proper -- see sunteckAdapter.ts's
  // own doc comment and this phase's final report for the full audit.
  "https://www.sunteckindia.com": {
    adapter: sunteckAdapter,
    projects: {
      "sunteckcity 4th avenue": SUNTECK_4TH_AVENUE_PROJECT_URL,
      "sunteckcity 4th avenue goregaon": SUNTECK_4TH_AVENUE_PROJECT_URL,
      "4th avenue": SUNTECK_4TH_AVENUE_PROJECT_URL,
      "sunteck altavia": SUNTECK_ALTAVIA_PROJECT_URL,
      "altavia": SUNTECK_ALTAVIA_PROJECT_URL,
    },
    sitemapUrl: "https://www.sunteckindia.com/sitemap.xml",
  },
  // Phase 53 -- 12th developer. "Codename Zest" is Heartland's own pre-launch
  // internal name (a real 301 redirect on the developer's own site, not a
  // separate project) -- deliberately never curated as its own entry here.
  // "The Minerva" (listed on the developer's own Mumbai project index page)
  // 301-redirects to the homepage -- no real project page exists yet, so it
  // is not curated either; see this phase's report for the full audit.
  "https://shapoorjirealestate.com": {
    adapter: shapoorjiPallonjiAdapter,
    projects: {
      "heartland": SP_HEARTLAND_PROJECT_URL,
      "shapoorji pallonji heartland": SP_HEARTLAND_PROJECT_URL,
      "the odyssey": SP_THE_ODYSSEY_PROJECT_URL,
      "shapoorji pallonji the odyssey": SP_THE_ODYSSEY_PROJECT_URL,
      "nine arcs": SP_NINE_ARCS_PROJECT_URL,
      "shapoorji pallonji nine arcs": SP_NINE_ARCS_PROJECT_URL,
      "bkc 9": SP_BKC_9_PROJECT_URL,
      "shapoorji pallonji bkc 9": SP_BKC_9_PROJECT_URL,
      "bkc 28": SP_BKC_28_PROJECT_URL,
      "shapoorji pallonji bkc 28": SP_BKC_28_PROJECT_URL,
      "codename np 1.2": SP_CODENAME_NP_1_2_PROJECT_URL,
      "codename np 1-2": SP_CODENAME_NP_1_2_PROJECT_URL,
      "shapoorji pallonji codename np 1.2": SP_CODENAME_NP_1_2_PROJECT_URL,
    },
    sitemapUrl: "https://shapoorjirealestate.com/sitemap.xml",
  },
  // Phase 54 -- thirteenth developer. Only 3 genuine current Mumbai-city
  // residential projects exist for this developer at all (not a truncated
  // sample -- Piramal Vaikunth is Thane/MMR, excluded; Piramal Corporate
  // Park is commercial-only, excluded); see this phase's report for the
  // full research audit. sitemapUrl is listed but not used as a discovery
  // tier for these 3 -- their canonical slugs weren't confirmed present in
  // the sitemap's own listing, so it's curated here as a last-resort tier
  // only, same caveat already documented for several other developers.
  "https://www.piramalrealty.com": {
    adapter: piramalRealtyAdapter,
    projects: {
      "piramal mahalaxmi": PIRAMAL_MAHALAXMI_PROJECT_URL,
      "piramal aranya": PIRAMAL_ARANYA_PROJECT_URL,
      "piramal revanta": PIRAMAL_REVANTA_PROJECT_URL,
    },
    sitemapUrl: "https://www.piramalrealty.com/sitemap.xml",
  },
};

/**
 * Runs a real, on-demand enrichment pass for ONE Project staging record
 * against its official developer source (Phase 29 Part G/H/J).
 *
 * Explicitly does NOT:
 *  - write anything to Project, Builder, or Locality
 *  - approve, reject, or otherwise change the staging record's status
 *  - cache or persist the full proposal anywhere -- every call re-fetches live
 *
 * Phase 46 Part B: DOES persist one small thing -- a compact
 * `enrichmentSummary` (status + outstanding field-key/classification pairs,
 * never the full proposal, see lib/enrichment/enrichmentSummary.ts) onto this
 * SAME staging record's payload, so the Review Queue can show "12 proposed,
 * 2 conflicts" without re-running this fetch for every row. See
 * `enrichProjectAction` below for where that persistence happens; this
 * function's own classification/resolution logic is unchanged from Phase 29.
 *
 * One click = one attempt. The caller (ReviewQueueList.tsx) must only invoke
 * this from an explicit button click, never from a page-load effect.
 */
async function computeEnrichmentResult(stagingRecordId: string): Promise<EnrichProjectResult> {
  await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "ERROR", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment is only available for Project staging records." };
  }

  const payload = record.payload as unknown as ProjectImportPayload;

  const domain = resolveDeveloperDomain(payload.developerGroup);
  const source = domain ? CURATED_SOURCES[domain] : undefined;
  if (!domain || !source) {
    return { status: "NO_SOURCE" };
  }

  // Phase 43 Part C tier 2 -- a project Included straight from discovery
  // (Phase 40) but not yet hand-curated here can still resolve immediately
  // via the REAL official URL that discovery already verified for it,
  // traced back through its own `sourceRef` ("discovery:<candidateId>").
  // Never trusted blindly: resolveCuratedProjectSource still checks it's on
  // this SAME resolved developer domain before using it (Part D).
  let knownSourceUrl: string | null = null;
  if (payload.sourceRef?.startsWith("discovery:")) {
    const discoveryCandidateId = payload.sourceRef.slice("discovery:".length);
    const candidateRecord = await prisma.ingestStagingRecord.findUnique({ where: { id: discoveryCandidateId }, select: { payload: true } });
    const candidatePayload = candidateRecord?.payload as { sourceUrl?: unknown } | undefined;
    if (typeof candidatePayload?.sourceUrl === "string") knownSourceUrl = candidatePayload.sourceUrl;
  }

  const projectSource = await resolveProjectSource(source, domain, payload.name, knownSourceUrl);
  if (projectSource.status === "NO_SOURCE") {
    return { status: "NO_SOURCE" };
  }
  if (projectSource.status === "AMBIGUOUS") {
    return { status: "ERROR", error: `Multiple possible official pages found for "${payload.name}" -- needs founder review before enrichment can proceed.` };
  }
  const projectUrl = projectSource.projectUrl!;

  const [locality, officialDeveloperWebsiteUrl] = await Promise.all([
    payload.localityId ? prisma.locality.findUnique({ where: { id: payload.localityId }, select: { name: true } }) : Promise.resolve(null),
    resolveOfficialDeveloperWebsite(payload),
  ]);

  let facts;
  try {
    // Phase 65 — same real production defect class as Phase 63's discovery-pipeline
    // fix: an adapter's fetchProjectFacts has no timeout of its own, and a single
    // real-world page that never responds (confirmed live, not hypothetical) would
    // otherwise hang this whole action indefinitely. A timeout here becomes just
    // another rejection, already handled by the existing catch below exactly the
    // same as any other fetch failure -- no new failure mode, no retry logic.
    facts = await Promise.race([
      source.adapter.fetchProjectFacts(projectUrl),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out fetching ${projectUrl}`)), 20_000)),
    ]);
  } catch {
    return { status: "SOURCE_UNAVAILABLE" };
  }

  const classified = classifyProjectEnrichment(
    payload,
    { localityName: locality?.name, officialDeveloperWebsiteUrl },
    facts,
    { url: projectUrl, tier: source.adapter.tier }
  );

  // Targeted fix (repeated rejected proposal bug) -- a field the founder
  // already explicitly rejected must not reappear as an identical
  // outstanding proposal on every subsequent Enrich run; a materially
  // different proposal (new value/items/source) still comes through.
  const recentEventsByField = await getMostRecentEnrichmentEventsByField(stagingRecordId);
  const fields = applyFounderEditAuthority(suppressPreviouslyRejectedProposals(classified, recentEventsByField), recentEventsByField);

  const { builderMatch, localityMatch } = await resolveBuilderAndLocalityMatches(fields, payload);

  const hasNewInfo =
    fields.some((f) => f.classification === "GREEN_NEW" || f.classification === "YELLOW" || f.classification === "CONFLICT") ||
    (builderMatch && builderMatch.classification !== "MISSING" && builderMatch.classification !== "CONFIRMED") ||
    (localityMatch && localityMatch.classification !== "MISSING" && localityMatch.classification !== "CONFIRMED");
  if (!hasNewInfo) {
    return { status: "NO_NEW_INFO", fields, builderMatch, localityMatch };
  }

  return { status: "SUCCESS", fields, builderMatch, localityMatch };
}

/** Maps enrichProjectAction's own result vocabulary onto the persisted summary's status vocabulary (Phase 46 Part D) -- kept as a 1:1 mapping, never collapsing two distinct meanings into one. */
function toEnrichmentSummaryStatus(status: EnrichProjectStatus): ProjectEnrichmentStatus {
  switch (status) {
    case "SUCCESS":
      return "READY";
    case "NO_NEW_INFO":
    case "NO_SOURCE":
    case "SOURCE_UNAVAILABLE":
    case "ERROR":
      return status;
  }
}

/**
 * Phase 46 Part B -- persists a compact enrichment-status summary onto this
 * staging record's payload after every run, regardless of outcome (Part D:
 * NOT_RUN/READY/NO_NEW_INFO/NO_SOURCE/SOURCE_UNAVAILABLE/ERROR must all be
 * distinguishable at a glance). Best-effort: mirrors logAudit's own
 * swallow-errors convention (lib/audit.ts) -- a summary-persistence failure
 * must never fail the enrichment result itself, since the result the founder
 * sees in the dialog is already complete and correct without it.
 */
async function persistEnrichmentSummary(stagingRecordId: string, result: EnrichProjectResult): Promise<ProjectReviewSnapshot | undefined> {
  try {
    const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
    if (!record || record.entityType !== "Project") return undefined;
    const payload = record.payload as unknown as Record<string, unknown>;
    const summary = buildEnrichmentSummary(toEnrichmentSummaryStatus(result.status), result.fields);
    const payloadToWrite = { ...payload, enrichmentSummary: summary };
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue },
    });
    return await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  } catch (error) {
    console.error("[enrichmentSummary] failed to persist for", stagingRecordId, error);
    return undefined;
  }
}

/**
 * Public entry point -- runs computeEnrichmentResult (Phase 29's unchanged
 * classification/resolution pipeline) and then persists its compact summary
 * (Phase 46 Part B) before returning the exact same result the founder has
 * always seen. Splitting the wrapper from the computation keeps every
 * existing early-return branch inside computeEnrichmentResult untouched --
 * this function is the only new code path.
 */
export async function enrichProjectAction(stagingRecordId: string): Promise<EnrichProjectResult> {
  const result = await computeEnrichmentResult(stagingRecordId);
  const snapshot = await persistEnrichmentSummary(stagingRecordId, result);
  return { ...result, snapshot };
}

/**
 * Phase 33 -- when the source produced a `developerGroup` and/or `locality`
 * fact, tries to resolve that NAME against the existing Builder/Locality
 * tables (never creates a row). Only queries the DB when there's actually a
 * proposed name to resolve, so a source that never mentions either (e.g.
 * Adani's page has no discrete locality field, per Phase 31) costs nothing
 * extra.
 */
async function resolveBuilderAndLocalityMatches(
  fields: EnrichmentField[],
  payload: ProjectImportPayload
): Promise<{ builderMatch?: EntityMatchProposal; localityMatch?: EntityMatchProposal }> {
  const developerGroupField = fields.find((f) => f.key === "developerGroup");
  const localityField = fields.find((f) => f.key === "locality");

  const [builderMatch, localityMatch] = await Promise.all([
    // `sourceUrl` (not just `proposedValue`) is the correct gate: since the
    // targeted classifyEnrichment fix, a field with NO real source fact still
    // carries a `proposedValue` that mirrors its current value (a CONFIRMED-
    // by-omission, `sourceUrl: null`) -- that must not trigger a Builder
    // lookup. A field the source genuinely reported on always has a real
    // `sourceUrl`, whatever its classification.
    developerGroupField?.proposedValue && developerGroupField.sourceUrl
      ? (async () => {
          const builders = await prisma.builder.findMany({ select: { id: true, name: true, legalNames: true, reraNumber: true } });
          const currentBuilder = payload.builderId ? (builders.find((b) => b.id === payload.builderId) ?? null) : null;
          const match = resolveBuilderMatch(builders, developerGroupField.proposedValue!);
          return buildEntityMatchProposal(
            "builder",
            "Builder",
            developerGroupField.proposedValue!,
            payload.builderId ?? null,
            currentBuilder?.name ?? null,
            match
          );
        })()
      : Promise.resolve(undefined),
    localityField?.proposedValue && localityField.sourceUrl
      ? (async () => {
          const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
          const localities = city
            ? await prisma.locality.findMany({
                where: { cityId: city.id },
                select: { id: true, name: true, aliases: { select: { alias: true } } },
              })
            : [];
          const flattened = localities.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases.map((a) => a.alias) }));
          const currentLocality = payload.localityId ? (localities.find((l) => l.id === payload.localityId) ?? null) : null;
          const match = resolveLocalityMatch(flattened, localityField.proposedValue!);
          return buildEntityMatchProposal(
            "locality",
            "Locality",
            localityField.proposedValue!,
            payload.localityId ?? null,
            currentLocality?.name ?? null,
            match
          );
        })()
      : Promise.resolve(undefined),
  ]);

  return { builderMatch, localityMatch };
}

/**
 * Targeted fix (real-time Review Queue synchronization) -- the SAME
 * completeness/readiness/badge data page.tsx computes for every card on a
 * full page load, recomputed here straight from the payload a mutation JUST
 * wrote. Every field-level mutation action below attaches one of these to
 * its SUCCESS result so the caller (ReviewQueueList) can update the parent
 * Review Queue card immediately from the mutation's own response, instead of
 * relying solely on router.refresh()'s separate, slower, best-effort
 * round-trip (kept as a background sync, not the source of truth for the UI
 * update). No new counting rules -- this calls the exact same
 * buildProjectReviewCompleteness / computeApprovalReadiness /
 * deriveEnrichmentBadge functions the server already used to render the
 * queue.
 */
export interface ProjectReviewSnapshot {
  completeness: ReviewCompleteness;
  enrichmentBadge: EnrichmentBadgeInfo;
  enrichmentOutstanding: Record<string, "GREEN_NEW" | "YELLOW" | "CONFLICT"> | null;
  readiness: ApprovalReadinessResult;
}

/**
 * Targeted fix (Official Developer Website) -- read-only resolution of the
 * canonical developer website for one Project payload, reusing the EXACT
 * mechanism Phase 69's Discovery Include flow already uses
 * (resolveSavedDeveloperWebsite: builderId when already matched, else an
 * exact-name match against every Builder) rather than inventing a second
 * lookup. Never writes to Builder -- a founder override for THIS project
 * lives only on `payload.developerWebsiteUrl` (see reviewFieldRegistry.ts).
 */
/**
 * Targeted fix (Research Automation) -- exported so lib/actions/research.ts
 * can reuse the EXACT same resolution this file's own enrichment/snapshot
 * paths already use, rather than a second Builder-website lookup.
 */
export async function resolveOfficialDeveloperWebsite(payload: ProjectImportPayload): Promise<string | null> {
  if (payload.builderId) {
    const builder = await prisma.builder.findUnique({ where: { id: payload.builderId }, select: { websiteUrl: true } });
    if (builder?.websiteUrl) return builder.websiteUrl;
  }
  if (payload.developerGroup) {
    const builders = await prisma.builder.findMany({ select: { id: true, name: true, legalNames: true, reraNumber: true, websiteUrl: true } });
    const saved = resolveSavedDeveloperWebsite(payload.developerGroup, builders);
    if (saved?.websiteUrl) return saved.websiteUrl;
  }
  return null;
}

/**
 * Targeted fix (Research Automation) -- exported so lib/actions/research.ts
 * returns snapshots through the SAME mechanism every other enrichment
 * mutation already uses, never a second computation.
 */
export async function buildProjectReviewSnapshot(payload: Record<string, unknown>, matchedExistingId: string | null): Promise<ProjectReviewSnapshot> {
  const projectPayload = payload as unknown as ProjectImportPayload;
  const [locality, matched, officialDeveloperWebsiteUrl] = await Promise.all([
    projectPayload.localityId
      ? prisma.locality.findUnique({ where: { id: projectPayload.localityId }, select: { name: true } })
      : Promise.resolve(null),
    matchedExistingId
      ? prisma.project.findUnique({ where: { id: matchedExistingId }, select: { name: true, status: true, reraNumber: true } })
      : Promise.resolve(null),
    resolveOfficialDeveloperWebsite(projectPayload),
  ]);
  const completeness = buildProjectReviewCompleteness(projectPayload, {
    localityName: locality?.name,
    matched: matched ? { name: matched.name, status: matched.status, reraNumber: matched.reraNumber } : null,
    officialDeveloperWebsiteUrl,
  });
  return {
    completeness,
    readiness: computeApprovalReadiness(completeness),
    enrichmentBadge: deriveEnrichmentBadge(payload),
    enrichmentOutstanding: readEnrichmentSummary(payload)?.outstanding ?? null,
  };
}

export type AcceptEnrichmentFieldStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_FIELD" | "INVALID_VALUE" | "ERROR";

export interface AcceptEnrichmentFieldResult {
  status: AcceptEnrichmentFieldStatus;
  error?: string;
  /** Present on SUCCESS only -- see ProjectReviewSnapshot's own doc comment. */
  snapshot?: ProjectReviewSnapshot;
}

export interface AcceptEnrichmentFieldContext {
  /** What the founder saw as "Current" before this accept -- only used when this is the field's very first acceptance (no prior history exists yet to read it from instead). */
  currentDisplayValue?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: string | null;
  /**
   * Targeted fix (founder-edit authority) -- true only when the founder
   * actually typed a value different from what was being proposed (never on
   * a plain "Accept" of the exact proposed value). `overriddenValue`/
   * `overriddenItems` are the field's `externalValue`/`externalItems` at the
   * moment of this edit -- see EnrichmentHistorySnapshot's own doc comment
   * for why this must be `externalValue`, never `proposedValue` (which is
   * null once a field is already FOUNDER_EDITED).
   */
  founderEdited?: boolean;
  overriddenValue?: string | null;
  overriddenItems?: string[];
}

/**
 * Persists ONE accepted enrichment field into the existing PENDING staging
 * record's payload (Phase 32 Part E) -- never writes to Project, Transaction,
 * Builder, or Locality, and never touches the staging record's own status.
 * The existing Approve/Reject workflow (approveStagingRecordAction) is the
 * only thing that ever moves data into the live catalog; this action only
 * makes the PENDING record itself more complete before that step.
 *
 * Reuses the existing 44-field registry (buildProjectReviewCompleteness) to
 * validate `fieldKey` is a real Project field, and the existing
 * IngestStagingRecord.payload Json column as the persistence target -- no
 * new table, model, or column. `proposedItems`, when given, is the real
 * underlying list behind a count-displayed field (e.g. actual amenity names,
 * not just "14 selected") -- see lib/enrichment/types.ts's RawSourceFact.items.
 *
 * Phase 37: also records a field-level history event on the EXISTING
 * AuditLog model (logAudit -- the same mechanism the Project edit page's own
 * History panel already reads), scoped as
 * entityType="ProjectEnrichmentField", entityId=stagingRecordId. The action
 * type (ACCEPT / EDIT_ACCEPT / RE_ACCEPT) is derived from this field's own
 * most recent history event, not trusted from the client. A logging failure
 * never fails the accept itself -- logAudit already swallows its own errors
 * (see lib/audit.ts), matching every other call site in this codebase.
 *
 * Same auth bar as enrichProjectAction (Part K) -- accepting a field is a
 * staging-only write, not the higher-stakes catalog write approval requires.
 */
export async function acceptEnrichmentFieldAction(
  stagingRecordId: string,
  fieldKey: string,
  proposedValue: string,
  proposedItems?: string[],
  context?: AcceptEnrichmentFieldContext
): Promise<AcceptEnrichmentFieldResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment acceptance is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;

  const completeness = buildProjectReviewCompleteness(payload as unknown as ProjectImportPayload, {});
  const validKeys = new Set(completeness.groups.flatMap((g) => g.fields.map((f) => f.key)));
  if (!validKeys.has(fieldKey)) {
    return { status: "INVALID_FIELD", error: `"${fieldKey}" is not a recognized Project field.` };
  }

  const applied = applyAcceptedField(payload, fieldKey, proposedValue, proposedItems);
  if (!applied.ok) {
    return { status: "INVALID_VALUE", error: applied.error };
  }

  // Phase 46 Part I -- accepting this field resolves it, so it should stop
  // showing up in the Review Queue's "N proposed" badge until the next
  // explicit Enrich run. Merged into the SAME write, not a second update.
  const payloadToWrite = withFieldTouched(applied.payload, fieldKey);

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const mostRecent = await getMostRecentEnrichmentHistoryEvent(stagingRecordId, fieldKey);
  const actionType = determineAcceptActionType(mostRecent);
  const diffs = computePayloadDiff(payload, applied.payload);

  const before: EnrichmentHistorySnapshot = mostRecent?.after
    ? mostRecent.after
    : {
        fieldKey,
        displayValue: context?.currentDisplayValue ?? null,
        payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.before }))),
      };
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: proposedValue,
    displayItems: proposedItems,
    payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.after }))),
    sourceUrl: context?.sourceUrl ?? null,
    sourceType: context?.sourceType ?? null,
    confidence: context?.confidence ?? null,
    founderEdited: context?.founderEdited,
    overriddenValue: context?.founderEdited ? (context?.overriddenValue ?? null) : undefined,
    overriddenItems: context?.founderEdited ? context?.overriddenItems : undefined,
  };

  await logAudit(session.userId, actionTypeToStoredAction(actionType), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before, after });

  const snapshot = await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  return { status: "SUCCESS", snapshot };
}

export type RejectEnrichmentFieldStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_FIELD" | "INVALID_REASON" | "ERROR";

export interface RejectEnrichmentFieldResult {
  status: RejectEnrichmentFieldStatus;
  error?: string;
  /** Present on SUCCESS only -- see ProjectReviewSnapshot's own doc comment. */
  snapshot?: ProjectReviewSnapshot;
}

export interface RejectEnrichmentFieldContext {
  /** The proposed value the founder is declining -- recorded for the history entry only; never written to the staging payload. */
  proposedValue?: string | null;
  proposedItems?: string[];
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: string | null;
}

/**
 * Targeted fix (post-Phase 71B founder testing) -- the third decision a
 * founder needs alongside Accept/Edit: explicitly decline a proposed
 * enrichment value, with a required reason, recorded to history. Never
 * applies `proposedValue` to the staging payload (the current value stands,
 * exactly like the old client-only "Keep Current" this replaces) and never
 * touches the live Project -- same PENDING-only guard as
 * acceptEnrichmentFieldAction/revertEnrichmentFieldAction.
 *
 * Still calls withFieldTouched: rejecting is a real founder decision that
 * resolves this field for the current enrichment run, so it should stop
 * counting toward the Review Queue's "N proposed"/"N conflict" badge until
 * the next explicit Enrich run -- exactly like Accept and Undo already do.
 *
 * Reuses the EXISTING AuditLog-backed enrichment-history mechanism
 * (ENRICHMENT_HISTORY_ENTITY_TYPE, same entityId) rather than a second
 * history system -- this is the one new action type it adds, "REJECT"
 * (stored as "enrichment.reject", matching the existing "enrichment.*"
 * naming convention every other action here already uses).
 */
export async function rejectEnrichmentFieldAction(
  stagingRecordId: string,
  fieldKey: string,
  reason: string,
  context?: RejectEnrichmentFieldContext
): Promise<RejectEnrichmentFieldResult> {
  const session = await requireMutateSession();

  if (!reason || !reason.trim()) {
    return { status: "INVALID_REASON", error: "A reason is required to reject this proposal." };
  }

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment rejection is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;

  const completeness = buildProjectReviewCompleteness(payload as unknown as ProjectImportPayload, {});
  const validKeys = new Set(completeness.groups.flatMap((g) => g.fields.map((f) => f.key)));
  if (!validKeys.has(fieldKey)) {
    return { status: "INVALID_FIELD", error: `"${fieldKey}" is not a recognized Project field.` };
  }

  const payloadToWrite = withFieldTouched(payload, fieldKey);

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: context?.proposedValue ?? null,
    displayItems: context?.proposedItems,
    payloadChanges: {},
    reason: reason.trim(),
    sourceUrl: context?.sourceUrl ?? null,
    sourceType: context?.sourceType ?? null,
    confidence: context?.confidence ?? null,
  };

  await logAudit(session.userId, actionTypeToStoredAction("REJECT"), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before: null, after });

  const snapshot = await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  return { status: "SUCCESS", snapshot };
}

export type AcceptEntityMatchStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_ENTITY" | "ERROR";

export interface AcceptEntityMatchResult {
  status: AcceptEntityMatchStatus;
  error?: string;
  /** Present on SUCCESS only -- see ProjectReviewSnapshot's own doc comment. */
  snapshot?: ProjectReviewSnapshot;
}

/**
 * Persists a founder-selected EXISTING Builder/Locality id into the existing
 * PENDING staging record's payload (Phase 33 Part F/G) -- never creates a
 * Builder or Locality row, never writes to Project, and never touches the
 * staging record's own status. `existingId` is re-verified against the real
 * table on every call (Part L "invalid entity ID rejected") rather than
 * trusted from the client, since a stale/tampered id must never silently
 * land in the staging payload.
 *
 * Same auth bar as acceptEnrichmentFieldAction (Part L) -- this is a
 * staging-only write, not the higher-stakes catalog write approval requires.
 */
export async function acceptEntityMatchAction(
  stagingRecordId: string,
  entityKind: "builder" | "locality",
  existingId: string
): Promise<AcceptEntityMatchResult> {
  await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Builder/Locality resolution is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  const exists =
    entityKind === "builder"
      ? await prisma.builder.findUnique({ where: { id: existingId }, select: { id: true } })
      : await prisma.locality.findUnique({ where: { id: existingId }, select: { id: true } });
  if (!exists) {
    return { status: "INVALID_ENTITY", error: `This ${entityKind} no longer exists.` };
  }

  const payload = record.payload as unknown as Record<string, unknown>;
  const payloadKey = entityKind === "builder" ? "builderId" : "localityId";
  const updatedPayload = { ...payload, [payloadKey]: existingId };

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: updatedPayload as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const snapshot = await buildProjectReviewSnapshot(updatedPayload, record.matchedExistingId);
  return { status: "SUCCESS", snapshot };
}

export type RejectEntityMatchStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_REASON" | "ERROR";

export interface RejectEntityMatchResult {
  status: RejectEntityMatchStatus;
  error?: string;
  snapshot?: ProjectReviewSnapshot;
}

/**
 * Targeted fix (Reject option consistency) -- the Builder/Locality
 * "Existing-record match" card's CONFLICT state used to offer only a
 * client-only "Keep Current" button (no reason, no persistence, no history
 * -- see EntityMatchCard.tsx's prior doc comment). That's a genuine
 * actionable proposal (a real existing row the founder is being asked to
 * switch to) and deserves the SAME founder-decision discipline every other
 * field's Reject already has. Reuses the EXISTING enrichment-history
 * mechanism (ENRICHMENT_HISTORY_ENTITY_TYPE, same entityId) under a
 * synthetic field key ("builderMatch"/"localityMatch") -- distinct from the
 * real "locality" registry field's own history, since declining a
 * builder/locality MATCH is a different decision than editing the
 * locality VALUE. Never applies the match (payload is never written here,
 * exactly like a field reject never applies its proposed value) and never
 * touches enrichmentSummary.outstanding (entity matches were never counted
 * in it to begin with -- see persistEnrichmentSummary's own doc comment).
 */
export async function rejectEntityMatchAction(
  stagingRecordId: string,
  entityKind: "builder" | "locality",
  reason: string,
  context?: { proposedName?: string | null }
): Promise<RejectEntityMatchResult> {
  const session = await requireMutateSession();

  if (!reason || !reason.trim()) {
    return { status: "INVALID_REASON", error: "A reason is required to reject this match." };
  }

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Builder/Locality resolution is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  const fieldKey = entityKind === "builder" ? "builderMatch" : "localityMatch";
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: context?.proposedName ?? null,
    payloadChanges: {},
    reason: reason.trim(),
  };
  await logAudit(session.userId, actionTypeToStoredAction("REJECT"), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before: null, after });

  const snapshot = await buildProjectReviewSnapshot(record.payload as Record<string, unknown>, record.matchedExistingId);
  return { status: "SUCCESS", snapshot };
}

/**
 * Read-only: every history event recorded for one Project staging record's
 * one enrichment field, newest first -- powers the "View History" dialog.
 * Same auth bar as every other action here (Part H); this is admin-only page
 * content, not a public read.
 */
export async function getEnrichmentFieldHistoryAction(stagingRecordId: string, fieldKey: string): Promise<EnrichmentHistoryEntry[]> {
  await requireMutateSession();
  return getEnrichmentFieldHistory(stagingRecordId, fieldKey);
}

export type RevertEnrichmentFieldStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "NOTHING_TO_UNDO" | "CONFLICT" | "ERROR";

export interface RevertEnrichmentFieldResult {
  status: RevertEnrichmentFieldStatus;
  error?: string;
  /** Present on SUCCESS only -- see ProjectReviewSnapshot's own doc comment. */
  snapshot?: ProjectReviewSnapshot;
}

/**
 * Undoes the most recent accepted enrichment value for one field, restoring
 * the EXACT prior raw payload value(s) (Part E -- never a blind null/blank,
 * never a re-parsed display string) -- reuses the same
 * IngestStagingRecord.payload persistence path acceptEnrichmentFieldAction
 * already writes through; no second persistence mechanism.
 *
 * Concurrency (Part G): re-reads the staging record fresh, then requires
 * `historyEventId` to still be this field's single most recent history
 * event. If someone else (or another browser tab) has accepted/edited/
 * undone this same field since the caller last loaded it, `historyEventId`
 * will no longer be the latest one -- this returns CONFLICT and changes
 * nothing, rather than trusting a stale client-side value.
 *
 * Records its own REVERT history event afterward -- prior events are never
 * updated or deleted (Part "HISTORY MUST BE IMMUTABLE"). A revert never
 * invents source/confidence provenance for the restored value (Part
 * "SOURCE" -- "do not invent provenance for old values").
 */
export async function revertEnrichmentFieldAction(
  stagingRecordId: string,
  fieldKey: string,
  historyEventId: string
): Promise<RevertEnrichmentFieldResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment history is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return {
      status: "NOT_PENDING",
      error: "This record is no longer pending review -- undoing an enrichment value is only possible before approval.",
    };
  }

  const mostRecent = await getMostRecentEnrichmentHistoryEvent(stagingRecordId, fieldKey);
  if (!mostRecent) {
    return { status: "NOTHING_TO_UNDO", error: "This field has no accepted enrichment value to undo." };
  }
  if (mostRecent.id !== historyEventId) {
    return {
      status: "CONFLICT",
      error: "This field has changed since you last viewed it. Please review the current value and history before undoing.",
    };
  }
  if (mostRecent.action === "REVERT") {
    return { status: "NOTHING_TO_UNDO", error: "This field is already at its original value -- there's nothing further to undo." };
  }
  if (!mostRecent.before) {
    return { status: "ERROR", error: "This history event has no recorded prior value to restore." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;
  const restoreChanges = mostRecent.before.payloadChanges;
  // applyStorableChanges DELETES a key whose stored value is the UNSET
  // marker (a genuinely blank field before the enrichment change), rather
  // than merely omitting it from a spread -- a plain `{...payload,
  // ...restoreChanges}` would silently leave the CURRENT accepted value in
  // place for exactly that case, which is the one Part "UNDO BEHAVIOR"
  // explicitly calls out as never acceptable.
  const restoredPayload = applyStorableChanges(payload, restoreChanges);
  // Phase 46 Part I/J -- undoing also counts as "touched"; the badge should
  // stop flagging this field until the founder explicitly re-runs Enrich.
  const payloadToWrite = withFieldTouched(restoredPayload, fieldKey);

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const currentRawValues = toStorableChanges(Object.keys(restoreChanges).map((key) => ({ key, value: payload[key] })));
  const before: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: mostRecent.after?.displayValue ?? null,
    displayItems: mostRecent.after?.displayItems,
    payloadChanges: currentRawValues,
  };
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: mostRecent.before.displayValue,
    displayItems: mostRecent.before.displayItems,
    payloadChanges: restoreChanges,
  };

  await logAudit(session.userId, actionTypeToStoredAction("REVERT"), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before, after });

  const snapshot = await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  return { status: "SUCCESS", snapshot };
}

export type UploadEnrichmentMediaStatus = "SUCCESS" | "NOT_FOUND" | "NOT_PENDING" | "INVALID_FILE" | "ERROR";

export interface UploadEnrichmentMediaResult {
  status: UploadEnrichmentMediaStatus;
  error?: string;
  url?: string;
  /** Present on SUCCESS only -- see ProjectReviewSnapshot's own doc comment. */
  snapshot?: ProjectReviewSnapshot;
}

export interface UploadEnrichmentMediaContext {
  /** field.externalValue/externalItems from the LIVE dialog, captured the exact same way a plain-text edit's founder-authority override is -- an upload is, by definition, always a founder-provided value, never a verbatim accept of the source's own value. */
  overriddenValue: string | null;
  overriddenItems?: string[];
  sourceUrl?: string | null;
}

/**
 * Targeted fix (Cover Image optional upload) -- persists an uploaded image
 * file into the existing PENDING staging record's payload, reusing:
 *  - the SAME Cloudinary upload pipeline `addProjectImageAction`/
 *    `uploadBrochureThumbnailAction` already use (lib/cloudinary.ts) -- no
 *    new storage integration,
 *  - the SAME `applyAcceptedField`/`withFieldTouched` payload-write path
 *    every other field accept goes through,
 *  - the SAME enrichment-history mechanism, marked `founderEdited` (an
 *    upload is always a hand-provided value, never a verbatim source
 *    accept) so it gets the exact same founder-authority protection on the
 *    next Enrich run as a manually-typed edit.
 * Never writes to the live Project/ProjectImage tables -- exactly like
 * every other enrichment mutation, this only makes the PENDING record more
 * complete; the existing Approve flow is still the only path into the
 * catalog. `fieldKey` is restricted to "coverImage" (folder scoped by
 * staging record id, since a not-yet-approved project has no slug worth
 * trusting yet).
 */
export async function uploadEnrichmentImageAction(
  stagingRecordId: string,
  fieldKey: "coverImage",
  file: File,
  context: UploadEnrichmentMediaContext
): Promise<UploadEnrichmentMediaResult> {
  const session = await requireMutateSession();

  if (!(file instanceof File) || file.size === 0) {
    return { status: "INVALID_FILE", error: "Choose an image file to upload." };
  }

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment media upload is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  let uploaded;
  try {
    // skipCompression: true -- matches CoverImageUploader's own convention
    // for the live Project's hero image (the founder's own explicit
    // instruction there: cover images keep their exact original bytes).
    uploaded = await uploadImageFile(file, `mumbai-intel/staging/${stagingRecordId}/cover`, { skipCompression: true });
  } catch (error) {
    return { status: "ERROR", error: error instanceof Error ? error.message : "Upload failed." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;
  const applied = applyAcceptedField(payload, fieldKey, uploaded.url);
  if (!applied.ok) {
    return { status: "ERROR", error: applied.error };
  }
  const payloadToWrite = withFieldTouched(applied.payload, fieldKey);

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const mostRecent = await getMostRecentEnrichmentHistoryEvent(stagingRecordId, fieldKey);
  const actionType = determineAcceptActionType(mostRecent);
  const diffs = computePayloadDiff(payload, applied.payload);

  const before: EnrichmentHistorySnapshot = mostRecent?.after
    ? mostRecent.after
    : { fieldKey, displayValue: null, payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.before }))) };
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: uploaded.url,
    payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.after }))),
    sourceUrl: context.sourceUrl ?? null,
    founderEdited: true,
    overriddenValue: context.overriddenValue,
    overriddenItems: context.overriddenItems,
  };

  await logAudit(session.userId, actionTypeToStoredAction(actionType), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before, after });

  const snapshot = await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  return { status: "SUCCESS", url: uploaded.url, snapshot };
}

/**
 * Targeted fix (Brochure prominent upload) -- same shape as
 * uploadEnrichmentImageAction above, reusing `uploadDocumentFile` (the exact
 * Cloudinary raw-PDF pipeline `uploadBrochureForProject` already uses for the
 * live Project) rather than a second document-storage integration.
 *
 * No server-side PDF compression is applied: this codebase's Cloudinary
 * integration uploads brochures as a `raw` resource (lib/cloudinary.ts's
 * `uploadDocumentFile`), and Cloudinary's raw resource type does not support
 * the transformation/quality pipeline `uploadImageFile` uses for images --
 * there is no existing, verified mechanism anywhere in this codebase for
 * safely re-encoding a PDF's contents. Rather than bolt on an unverified
 * compression step that risks silently corrupting a founder's document, this
 * uploads the file exactly as provided -- see this phase's final report for
 * the full limitation writeup.
 */
export async function uploadEnrichmentBrochureAction(
  stagingRecordId: string,
  file: File,
  context: UploadEnrichmentMediaContext
): Promise<UploadEnrichmentMediaResult> {
  const session = await requireMutateSession();
  const fieldKey = "brochure";

  if (!(file instanceof File) || file.size === 0) {
    return { status: "INVALID_FILE", error: "Choose a PDF file to upload." };
  }
  if (file.type !== "application/pdf") {
    return { status: "INVALID_FILE", error: "Only PDF files are allowed." };
  }

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) {
    return { status: "NOT_FOUND", error: "Staging record not found." };
  }
  if (record.entityType !== "Project") {
    return { status: "ERROR", error: "Enrichment media upload is only available for Project staging records." };
  }
  if (record.status !== "PENDING") {
    return { status: "NOT_PENDING", error: "This record is no longer pending review -- it has already been approved or rejected." };
  }

  let uploaded;
  try {
    uploaded = await uploadDocumentFile(file, `mumbai-intel/staging/${stagingRecordId}/brochure`);
  } catch (error) {
    return { status: "ERROR", error: error instanceof Error ? error.message : "Upload failed." };
  }

  const payload = record.payload as unknown as Record<string, unknown>;
  const applied = applyAcceptedField(payload, fieldKey, uploaded.url);
  if (!applied.ok) {
    return { status: "ERROR", error: applied.error };
  }
  const payloadToWrite = withFieldTouched(applied.payload, fieldKey);

  try {
    await prisma.ingestStagingRecord.update({
      where: { id: stagingRecordId },
      data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  const mostRecent = await getMostRecentEnrichmentHistoryEvent(stagingRecordId, fieldKey);
  const actionType = determineAcceptActionType(mostRecent);
  const diffs = computePayloadDiff(payload, applied.payload);

  const before: EnrichmentHistorySnapshot = mostRecent?.after
    ? mostRecent.after
    : { fieldKey, displayValue: null, payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.before }))) };
  const after: EnrichmentHistorySnapshot = {
    fieldKey,
    displayValue: uploaded.url,
    payloadChanges: toStorableChanges(diffs.map((d) => ({ key: d.key, value: d.after }))),
    sourceUrl: context.sourceUrl ?? null,
    founderEdited: true,
    overriddenValue: context.overriddenValue,
    overriddenItems: context.overriddenItems,
  };

  await logAudit(session.userId, actionTypeToStoredAction(actionType), ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, { before, after });

  const snapshot = await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  return { status: "SUCCESS", url: uploaded.url, snapshot };
}
