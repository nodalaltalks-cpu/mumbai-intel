import { describe, expect, it } from "vitest";
import { resolveLiveDuplicateStatus } from "./liveDuplicateStatus";
import type { ExistingLocalityWithAliases } from "./areaLocalityResolution";
import type { ExistingProjectCandidate } from "../duplicateMatch";

const LOCALITIES: ExistingLocalityWithAliases[] = [
  { id: "loc-andheri-west", name: "Andheri West", aliases: [] },
  { id: "loc-chembur", name: "Chembur", aliases: [] },
];

const EXISTING_PROJECTS: ExistingProjectCandidate[] = [
  { id: "proj-godrej", name: "Godrej Sky Shore", localityId: "loc-andheri-west", reraNumber: "PM1180002500076" },
  { id: "proj-runwal", name: "Runwal Seven", localityId: "loc-chembur", reraNumber: null },
];

describe("resolveLiveDuplicateStatus (Phase 58 — the founder-facing bug: a stale NO_MATCH badge vs. a live CLEAR_ALIAS)", () => {
  it("Godrej Skyshore — the exact reported case: a candidate whose stored snapshot could say NO_MATCH now resolves live as CLEAR_ALIAS against an existing 'Godrej Sky Shore' project", () => {
    const result = resolveLiveDuplicateStatus(
      { projectName: "Godrej Skyshore", areaName: "Versova, Andheri West" },
      LOCALITIES,
      EXISTING_PROJECTS
    );
    expect(result?.duplicateStatus).toBe("CLEAR_ALIAS");
    expect(result?.match?.existingName).toBe("Godrej Sky Shore");
  });

  it("CLEAR_ALIAS via the compact-name tier — a spelling variant the word-matcher alone would miss ('Godrej Sky Shore' vs 'Godrej Skyshore') still resolves live, matching classifyDiscoveryDuplicate's own documented worked example", () => {
    const result = resolveLiveDuplicateStatus({ projectName: "Godrej Skyshore", areaName: "Andheri West" }, LOCALITIES, EXISTING_PROJECTS);
    expect(result?.duplicateStatus).toBe("CLEAR_ALIAS");
    expect(result?.match?.reason).toBe("compact_name_alias");
  });

  it("AMBIGUOUS — a partial name overlap in the same locality needs founder review, live just like at staging time", () => {
    const result = resolveLiveDuplicateStatus(
      { projectName: "Godrej Sky Residences", areaName: "Andheri West" },
      LOCALITIES,
      EXISTING_PROJECTS
    );
    expect(result?.duplicateStatus).toBe("AMBIGUOUS");
    expect(result?.match?.existingId).toBe("proj-godrej");
  });

  it("NO_MATCH — a genuinely new project name is never flagged just because it shares a locality with something else", () => {
    const result = resolveLiveDuplicateStatus({ projectName: "Kalpataru Vian", areaName: "Andheri West" }, LOCALITIES, EXISTING_PROJECTS);
    expect(result?.duplicateStatus).toBe("NO_MATCH");
    expect(result?.match).toBeNull();
  });

  it("NO_MATCH — same/similar name but a different locality is correctly left alone (locality-scoped, not renamed matching)", () => {
    const result = resolveLiveDuplicateStatus({ projectName: "Runwal Seven", areaName: "Andheri West" }, LOCALITIES, EXISTING_PROJECTS);
    expect(result?.duplicateStatus).toBe("NO_MATCH");
  });

  it("returns null (never guesses) when the candidate's areaName doesn't resolve to exactly one existing Locality — caller falls back to the stored snapshot rather than a wrong live answer", () => {
    const result = resolveLiveDuplicateStatus({ projectName: "Godrej Skyshore", areaName: "Somewhere Not A Real Locality" }, LOCALITIES, EXISTING_PROJECTS);
    expect(result).toBeNull();
  });

  it("self-heals in the other direction too: a project that no longer exists among the live candidates now resolves NO_MATCH even if the stored snapshot once said CLEAR_ALIAS", () => {
    const result = resolveLiveDuplicateStatus({ projectName: "Godrej Skyshore", areaName: "Andheri West" }, LOCALITIES, []);
    expect(result?.duplicateStatus).toBe("NO_MATCH");
  });

  it("also catches a duplicate of ANOTHER OPEN Discovery Queue candidate, not just a live Project — the real 'Rustomjee 9 JVPD' vs. 'Rustomjee 7 JVPD' case, where the match is another still-open candidate (computeLiveDuplicateStatuses maps every other candidate into this same existingProjects shape before calling this function)", () => {
    const otherCandidateAsExisting: ExistingProjectCandidate = {
      id: "cand-rustomjee-7-jvpd",
      name: "Rustomjee 7 JVPD",
      localityId: "loc-andheri-west",
      reraNumber: null,
    };
    const result = resolveLiveDuplicateStatus(
      { projectName: "Rustomjee 9 JVPD", areaName: "Andheri West" },
      LOCALITIES,
      [...EXISTING_PROJECTS, otherCandidateAsExisting]
    );
    expect(result?.duplicateStatus).toBe("AMBIGUOUS");
    expect(result?.match?.existingId).toBe("cand-rustomjee-7-jvpd");
  });
});
