import { describe, expect, it } from "vitest";
import { classifyDiscoveryDuplicate } from "./classifyDuplicate";
import type { ExistingProjectCandidate } from "../duplicateMatch";

const ANDHERI_WEST = "loc-andheri-west";
const CHEMBUR = "loc-chembur";

const EXISTING: ExistingProjectCandidate[] = [
  { id: "proj-godrej", name: "Godrej Sky Shore", localityId: ANDHERI_WEST, reraNumber: "PM1180002500076" },
  { id: "proj-runwal", name: "Runwal Seven", localityId: CHEMBUR, reraNumber: null },
];

describe("classifyDiscoveryDuplicate (Phase 39 Part F)", () => {
  it("1. EXACT — a matching RERA number resolves regardless of name/locality wording", () => {
    const result = classifyDiscoveryDuplicate(EXISTING, {
      name: "Godrej Skyshore Versova Andheri",
      localityId: ANDHERI_WEST,
      reraNumber: "PM1180002500076",
    });
    expect(result.duplicateStatus).toBe("EXACT");
    expect(result.match).toEqual({ existingId: "proj-godrej", existingName: "Godrej Sky Shore", confidence: 1, reason: "rera_number" });
  });

  it("2. CLEAR_ALIAS via the reused matcher — a location-qualifier suffix is a confident alias (0.75 similarity)", () => {
    const result = classifyDiscoveryDuplicate(EXISTING, { name: "Godrej Sky Shore, Versova", localityId: ANDHERI_WEST });
    expect(result.duplicateStatus).toBe("CLEAR_ALIAS");
    expect(result.match?.reason).toBe("name_locality");
    expect(result.match?.existingId).toBe("proj-godrej");
  });

  it("3. CLEAR_ALIAS via the compact-name addition — 'Godrej Sky Shore' vs 'Godrej Skyshore' (the exact Part F worked example the word-Jaccard matcher alone cannot catch)", () => {
    const result = classifyDiscoveryDuplicate(EXISTING, { name: "Godrej Skyshore", localityId: ANDHERI_WEST });
    expect(result.duplicateStatus).toBe("CLEAR_ALIAS");
    expect(result.match).toEqual({ existingId: "proj-godrej", existingName: "Godrej Sky Shore", confidence: 1, reason: "compact_name_alias" });
  });

  it("4. AMBIGUOUS — a same-locality partial name overlap below the clear-alias threshold needs human review", () => {
    // "Godrej Sky Residences" vs "Godrej Sky Shore": shared {godrej, sky} / union {godrej, sky, residences, shore} = 0.5 -- above the
    // reused matcher's own 0.5 floor, below this module's 0.75 clear-alias threshold.
    const result = classifyDiscoveryDuplicate(EXISTING, { name: "Godrej Sky Residences", localityId: ANDHERI_WEST });
    expect(result.duplicateStatus).toBe("AMBIGUOUS");
    expect(result.match?.existingId).toBe("proj-godrej");
  });

  it("5. NO_MATCH — a genuinely new project name in the same locality", () => {
    const result = classifyDiscoveryDuplicate(EXISTING, { name: "Kalpataru Vian", localityId: ANDHERI_WEST });
    expect(result.duplicateStatus).toBe("NO_MATCH");
    expect(result.match).toBeNull();
  });

  it("6. NO_MATCH — same/similar name but a DIFFERENT locality is never flagged as a duplicate", () => {
    const result = classifyDiscoveryDuplicate(EXISTING, { name: "Runwal Seven", localityId: ANDHERI_WEST });
    expect(result.duplicateStatus).toBe("NO_MATCH");
  });

  it("7. never auto-merges — every branch returns a label, never mutates or removes anything from the existing list", () => {
    const before = JSON.stringify(EXISTING);
    classifyDiscoveryDuplicate(EXISTING, { name: "Godrej Skyshore", localityId: ANDHERI_WEST });
    expect(JSON.stringify(EXISTING)).toBe(before);
  });
});
