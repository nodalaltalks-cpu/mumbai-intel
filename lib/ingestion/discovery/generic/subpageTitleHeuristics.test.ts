import { describe, expect, it } from "vitest";
import { looksLikeSubpageOrMarketingTitle } from "./subpageTitleHeuristics";

describe("looksLikeSubpageOrMarketingTitle — real Phase 58 failures (regression)", () => {
  it("1. flags a location subpage title (real: Lodha Cullinan Location & Address in Versova)", () => {
    const result = looksLikeSubpageOrMarketingTitle("Lodha Cullinan Location & Address in Versova");
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/Location & Address/);
  });

  it("2. flags a price-list subpage title (real: Lodha Eternis Price List)", () => {
    const result = looksLikeSubpageOrMarketingTitle("Lodha Eternis Price List");
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/Price List/);
  });

  it('3. flags "Residential Project by ..." SEO descriptor (real: JP Parkway – Residential Project by JP Infra)', () => {
    const result = looksLikeSubpageOrMarketingTitle("JP Parkway – Residential Project by JP Infra");
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/Residential Project by/);
  });

  it('4. flags "Luxury Residences in ..." SEO descriptor (real: ICONS 71 – Luxury Residences in Chembur, Mumbai)', () => {
    const result = looksLikeSubpageOrMarketingTitle("ICONS 71 – Luxury Residences in Chembur, Mumbai");
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/Luxury Residences/);
  });

  it("5. flags a full marketing sentence scraped as a name (real Piramal Revanta meta-description case)", () => {
    const result = looksLikeSubpageOrMarketingTitle(
      "Looking for ready to flats in Mumbai? Explore Piramal Revanta, a property in Mulund offering 1 - 5BHK flats with world class amenities & excellent connectivity"
    );
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/marketing sentence opener|question mark|unusually long/);
  });

  it("6. flags a floor-plan subpage title", () => {
    expect(looksLikeSubpageOrMarketingTitle("Rustomjee Crescent Floor Plans").suspicious).toBe(true);
  });

  it("7. flags a payment-plan subpage title", () => {
    expect(looksLikeSubpageOrMarketingTitle("Kalpataru Vian Payment Plan").suspicious).toBe(true);
  });

  it("8. flags an amenities subpage title", () => {
    expect(looksLikeSubpageOrMarketingTitle("Oberoi Sky Heights Amenities").suspicious).toBe(true);
  });
});

describe("looksLikeSubpageOrMarketingTitle — must NOT flag any real clean Phase 58 project name", () => {
  const CLEAN_NAMES = [
    "Kalpataru Vian",
    "Adani Western Heights",
    "Gurukrupa Maurya",
    "Gurukrupa Dhyanam",
    "Gurukrupa Aatman",
    "Gurukrupa Alaknanda",
    "Purva Estrella",
    "Lodha Cullinan",
    "Oberoi Sky Heights",
    "Oberoi Springs",
    "Serenova",
    "Rustomjee Balmoral Golf Links",
    "Rustomjee Ashiana",
    "Rustomjee 180 Bayview",
    "Rustomjee Crescent",
    "Rustomjee Panorama",
    "Rustomjee Crown",
    "Rustomjee Cleon",
    "Ozone Skye",
    "Rustomjee Parishram",
    "Rustomjee Elita",
    "Rustomjee Stella",
    "Rustomjee Prive",
    "Rustomjee Elements",
    "Rustomjee Seasons",
    "Rustomjee Aden",
    "Rustomjee Cliff Tower",
    "Rustomjee La Solita",
    "Rustomjee Adarsh Regal B",
    "SunteckCity 4th Avenue Goregaon",
    "Sunteck Signature Island",
    "Shapoorji Pallonji Heartland",
    "Shapoorji Pallonji The Odyssey",
    "Shapoorji Pallonji Nine Arcs",
    "Shapoorji Pallonji Codename NP 1.2",
    "Shapoorji Pallonji BKC 9",
    "Shapoorji Pallonji BKC 28",
    "Piramal Mahalaxmi",
    "Piramal Aranya",
    "Piramal Revanta",
  ];

  it.each(CLEAN_NAMES)('does not flag "%s"', (name) => {
    const result = looksLikeSubpageOrMarketingTitle(name);
    expect(result.suspicious).toBe(false);
  });
});
