/**
 * Phase 61 — the exact, locked 10 staging records manually reviewed in
 * Phase 59B. Deliberately its own tiny, non-"use server" module: a "use
 * server" file (lib/actions/autoAcceptPilot.ts) can only export async
 * Server Actions, never a plain constant (the same Phase 35 lesson
 * bulkEnrichment.ts's own doc comment already documents) — this constant is
 * imported by both the pilot action module and the debug page that displays
 * the project list, so it lives here instead of being duplicated.
 */
export interface PilotProject {
  id: string;
  name: string;
}

export const PILOT_PROJECTS: PilotProject[] = [
  { id: "cmthq11lz0001tghqhuplpbo9", name: "Kalpataru Vian" },
  { id: "cmtkn2axg000804l69o9rfvkt", name: "Rustomjee Crescent" },
  { id: "cmtkmwc8z000304kyapb9t8gb", name: "Rustomjee Crown" },
  { id: "cmtkn0clw000704kyfm2gn78u", name: "Rustomjee Cliff Tower" },
  { id: "cmthxts63000juchqkr5s3oeq", name: "Rustomjee Balmoral Golf Links" },
  { id: "cmtimcsgx0000bghq12q6a5zh", name: "Rustomjee 180 Bayview" },
  { id: "cmtkmxywq000504jrqp37zmv3", name: "Rustomjee Stella" },
  { id: "cmtikqpzv0000cohqskcvhqii", name: "Rustomjee Ashiana" },
  { id: "cmtkmwylj000804jzx1ms8dhv", name: "Rustomjee Seasons" },
  { id: "cmthvm7ok0009kohqt15q6a0t", name: "Oberoi Sky Heights" },
];

/**
 * Phase 61A — 3 candidates from the wider 39-project set (deliberately NOT
 * the Phase 59B ten above, which already had every Tier A field accepted).
 * Selected from real Phase 58/59 enrichment history because each has a
 * genuinely never-accepted RERA number + price, zero identity conflicts, and
 * (Nine Arcs aside) zero conflicts of any kind:
 *  - Rustomjee Cleon / Rustomjee Aden: 0 conflicts anywhere, RERA number and
 *    priceMin both GREEN_NEW as of the last real enrichment run.
 *  - Shapoorji Pallonji Nine Arcs: RERA/price also clean GREEN_NEW; carries
 *    one PRE-EXISTING, UNRELATED locality conflict ("Santacruz East" vs.
 *    "Santacruz East, Mumbai") — included deliberately to prove the
 *    field-level (not project-level) automation model: one field's known
 *    issue must never block a different, genuinely clean field on the same
 *    project. The locality field itself is never touched.
 * This is a fixed, hardcoded, one-time validation list — not a mechanism for
 * expanding the pilot to "the next N projects" automatically.
 */
export const PHASE61A_VALIDATION_PROJECTS: PilotProject[] = [
  { id: "cmtkmx31s000a04jzd080gelr", name: "Rustomjee Cleon" },
  { id: "cmtkmx205000304jrkpl0ncnk", name: "Rustomjee Aden" },
  { id: "cmtissy8o0006c0hquue6r1g2", name: "Shapoorji Pallonji Nine Arcs" },
];
