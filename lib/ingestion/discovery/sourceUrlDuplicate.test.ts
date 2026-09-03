import { describe, expect, it } from "vitest";
import { findExactSourceUrlDuplicate, normalizeSourceUrl } from "./sourceUrlDuplicate";

describe("normalizeSourceUrl", () => {
  it("1. lowercases scheme and host but leaves the path case untouched", () => {
    expect(normalizeSourceUrl("HTTPS://WWW.Kalpataru.com/mumbai/kalpataru-vian")).toBe("https://www.kalpataru.com/mumbai/kalpataru-vian");
  });

  it("2. strips a trailing slash", () => {
    expect(normalizeSourceUrl("https://www.kalpataru.com/mumbai/kalpataru-vian/")).toBe(normalizeSourceUrl("https://www.kalpataru.com/mumbai/kalpataru-vian"));
  });

  it("3. strips the URL fragment", () => {
    expect(normalizeSourceUrl("https://www.kalpataru.com/mumbai/kalpataru-vian#gallery")).toBe(normalizeSourceUrl("https://www.kalpataru.com/mumbai/kalpataru-vian"));
  });

  it("4. strips known tracking params but keeps other query params", () => {
    const a = normalizeSourceUrl("https://www.rustomjee.com/projects/residential/rustomjee-crescent/?utm_source=fb&unit=A");
    const b = normalizeSourceUrl("https://www.rustomjee.com/projects/residential/rustomjee-crescent/?unit=A");
    expect(a).toBe(b);
  });

  it("5. a genuinely different query param is NOT normalized away — different pages stay different", () => {
    const a = normalizeSourceUrl("https://www.rustomjee.com/projects/residential/rustomjee-crescent/?unit=A");
    const b = normalizeSourceUrl("https://www.rustomjee.com/projects/residential/rustomjee-crescent/?unit=B");
    expect(a).not.toBe(b);
  });

  it("6. returns null for an unparseable URL rather than throwing", () => {
    expect(normalizeSourceUrl("not a url")).toBeNull();
  });
});

describe("findExactSourceUrlDuplicate — real Phase 58 case", () => {
  it("1. flags the real Kalpataru Vian duplicate: same sourceUrl under two different scraped titles", () => {
    const existing = [
      { id: "clean-kalpataru-vian", sourceUrl: "https://www.kalpataru.com/mumbai/kalpataru-vian" },
      { id: "other-project", sourceUrl: "https://www.rustomjee.com/projects/residential/rustomjee-crescent/" },
    ];
    // The real garbled duplicate title was "Kalpataru Vian, Hrushikesh, Lokhandwala Andheri West" — this
    // function never looks at the name at all, only the URL, which was byte-identical in the real case.
    const match = findExactSourceUrlDuplicate(existing, "https://www.kalpataru.com/mumbai/kalpataru-vian");
    expect(match?.existingId).toBe("clean-kalpataru-vian");
  });

  it("2. still matches through a trailing-slash/case difference", () => {
    const existing = [{ id: "x", sourceUrl: "https://www.kalpataru.com/mumbai/kalpataru-vian" }];
    const match = findExactSourceUrlDuplicate(existing, "HTTPS://WWW.KALPATARU.COM/mumbai/kalpataru-vian/");
    expect(match?.existingId).toBe("x");
  });

  it("3. returns null when no existing record shares the URL", () => {
    const existing = [{ id: "x", sourceUrl: "https://www.kalpataru.com/mumbai/kalpataru-vian" }];
    expect(findExactSourceUrlDuplicate(existing, "https://www.rustomjee.com/projects/residential/rustomjee-stella/")).toBeNull();
  });

  it("4. returns null when candidateSourceUrl is null/undefined", () => {
    expect(findExactSourceUrlDuplicate([{ id: "x", sourceUrl: "https://a.com/b" }], null)).toBeNull();
  });

  it("5. never matches two records that only share a domain, not a path", () => {
    const existing = [{ id: "x", sourceUrl: "https://www.rustomjee.com/projects/residential/rustomjee-crescent/" }];
    expect(findExactSourceUrlDuplicate(existing, "https://www.rustomjee.com/projects/residential/rustomjee-stella/")).toBeNull();
  });
});
