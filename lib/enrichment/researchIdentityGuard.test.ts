import { describe, expect, it } from "vitest";
import { mentionsExcludedArea, checkMumbaiScope, verifyResearchEvidenceIdentity } from "./researchIdentityGuard";

describe("mentionsExcludedArea / checkMumbaiScope (Section 2/23 -- Mumbai-only filtering)", () => {
  it("flags Navi Mumbai, Thane, Mira Road, Vasai, Virar, and MMR text", () => {
    expect(mentionsExcludedArea("Sector 15, Navi Mumbai")).toBe(true);
    expect(mentionsExcludedArea("Ghodbunder Road, Thane West")).toBe(true);
    expect(mentionsExcludedArea("Mira Road East")).toBe(true);
    expect(mentionsExcludedArea("Vasai West")).toBe(true);
    expect(mentionsExcludedArea("Virar West")).toBe(true);
    expect(mentionsExcludedArea("Somewhere in the MMR")).toBe(true);
  });

  it("does not flag genuine Mumbai-city text", () => {
    expect(mentionsExcludedArea("Andheri West, Mumbai")).toBe(false);
    expect(mentionsExcludedArea("off Link Road, Andheri")).toBe(false);
  });

  it("a resolved existing Locality always wins -- Mumbai-city-scoped by construction, never re-litigated by a text scan", () => {
    const result = checkMumbaiScope({ resolvedLocalityName: "Andheri West", address: "Navi Mumbai mentioned incorrectly in free text" });
    expect(result.inScope).toBe(true);
  });

  it("an unresolved project whose address clearly names Thane is OUT of scope", () => {
    const result = checkMumbaiScope({ address: "Near Ghodbunder Road, Thane" });
    expect(result.inScope).toBe(false);
    expect(result.reason).toContain("Thane");
  });

  it("an unresolved project with no excluded-area signal stays in scope (never falsely excluded)", () => {
    const result = checkMumbaiScope({ address: "Off Link Road, Andheri West" });
    expect(result.inScope).toBe(true);
  });
});

describe("verifyResearchEvidenceIdentity (Section 12 -- project identity verification / wrong-project rejection)", () => {
  const context = { projectName: "Linkbay Residences", developerName: "Adani Realty", reraNumber: "P51800047539" };

  it("rejects a finding with NO identity signals at all -- unattributed evidence is never trusted", () => {
    const result = verifyResearchEvidenceIdentity(context, undefined);
    expect(result.verified).toBe(false);
  });

  it("RERA exact match verifies alone, the strongest signal", () => {
    const result = verifyResearchEvidenceIdentity(context, { pageRera: "P51800047539" });
    expect(result.verified).toBe(true);
  });

  it("a mismatched RERA number rejects outright, even if the project name also matches", () => {
    const result = verifyResearchEvidenceIdentity(context, { pageProjectName: "Linkbay Residences", pageRera: "P00000000000" });
    expect(result.verified).toBe(false);
    expect(result.reason).toContain("RERA");
  });

  it("project name AND developer name both matching verifies", () => {
    const result = verifyResearchEvidenceIdentity(context, { pageProjectName: "Linkbay Residences by Adani Realty", pageDeveloperName: "Adani Realty" });
    expect(result.verified).toBe(true);
  });

  it("the task's own worked example -- same project name, different developer/city (a second 'Aaradhya' elsewhere) is rejected, not merged", () => {
    const aaradhya = { projectName: "Aaradhya", developerName: "Rustomjee", reraNumber: null };
    const result = verifyResearchEvidenceIdentity(aaradhya, { pageProjectName: "Aaradhya", pageDeveloperName: "Some Other Developer In Thane" });
    expect(result.verified).toBe(false);
  });

  it("project name matches but no developer name is on file to cross-check -- stays unverified, never guessed past", () => {
    const noDeveloper = { projectName: "Aaradhya", developerName: null, reraNumber: null };
    const result = verifyResearchEvidenceIdentity(noDeveloper, { pageProjectName: "Aaradhya" });
    expect(result.verified).toBe(false);
  });

  it("tolerates real-world page-title noise (suffixes/prefixes) via loose containment matching", () => {
    const result = verifyResearchEvidenceIdentity(context, {
      pageProjectName: "Linkbay Residences | Adani Realty - 2 & 3 BHK Homes in Andheri West",
      pageDeveloperName: "Adani Realty",
    });
    expect(result.verified).toBe(true);
  });
});
