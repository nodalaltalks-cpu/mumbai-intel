import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOberoiRealtyFacts, oberoiRealtyAdapter, OBEROI_SKY_HEIGHTS_PROJECT_URL, OBEROI_SPRINGS_PROJECT_URL } from "./oberoiRealtyAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of oberoirealty.com's actual
 * markup for two Andheri West project pages, captured live during Phase 47:
 * a plain server-rendered Drupal page (no JSON payload at all -- confirmed
 * absent on the real page), `<h1>` project name, a `<div class="cnt_text">`
 * block per fact ("Location"/"Configuration"/"Project Status" -- which ones
 * appear varies per project, never assumed fixed), a plain-text MahaRERA
 * registration-number sentence, and `<p class="amenities_p">Name</p>` per
 * amenity.
 */
function buildRealShapedHtml(opts: {
  name: string;
  location?: string;
  configuration?: string;
  projectStatus?: string;
  rera?: string;
  amenities?: string[];
}): string {
  const facts: string[] = [];
  if (opts.location) facts.push(`<div class="cnt_text"><p>Location</p><h4>${opts.location}</h4></div>`);
  if (opts.configuration) facts.push(`<div class="cnt_text"><p>Configuration</p><h4>${opts.configuration}</h4></div>`);
  if (opts.projectStatus) facts.push(`<div class="cnt_text"><p>Project Status</p><h4>${opts.projectStatus}</h4></div>`);

  const amenitiesHtml = (opts.amenities ?? [])
    .map((a) => `<div class="amenities_col"><p class="amenities_p">${a}</p></div>`)
    .join("\n");

  return `
    <html>
      <head>
        <title>${opts.name} - Oberoi Realty</title>
        <meta name="description" content="${opts.name} by Oberoi Realty in Andheri West." />
      </head>
      <body>
        <h1 class="hd1">${opts.name}</h1>
        <p>Marketing description paragraph for ${opts.name}.</p>
        <div class="row pt-4">${facts.join("\n")}</div>
        ${opts.rera ? `<p><b>The project is registered with MahaRERA vide registration number: ${opts.rera} and is available on the website.</b></p>` : ""}
        <div class="amenities py-5">${amenitiesHtml}</div>
      </body>
    </html>
  `;
}

describe("extractOberoiRealtyFacts (Phase 47 -- seventh developer, plain server-rendered HTML, no JSON payload)", () => {
  it("1. extracts name, locality, RERA number, and amenities from a real-shaped Sky Heights-style page", () => {
    const html = buildRealShapedHtml({
      name: "Oberoi Sky Heights",
      location: "Andheri West",
      configuration: "4 BHK apartments, duplexes &amp; penthouses",
      rera: "P518000564254",
      amenities: ["Swimming Pool", "Air-conditioned Gym", "Aerobics Centre"],
    });
    const facts = extractOberoiRealtyFacts(html);
    expect(facts.name?.value).toBe("Oberoi Sky Heights");
    expect(facts.locality?.value).toBe("Andheri West");
    expect(facts.reraNumber?.value).toBe("P518000564254");
    expect(facts.amenities?.items).toEqual(["Swimming Pool", "Air-conditioned Gym", "Aerobics Centre"]);
    expect(facts.category?.value).toBe("Residential");
  });

  it("2. a 'Project Status: Completed' page maps to DELIVERED's label, at Medium confidence -- a justified phrasing variant, not a guess", () => {
    const html = buildRealShapedHtml({ name: "Oberoi Springs", location: "Andheri West", projectStatus: "Completed" });
    const facts = extractOberoiRealtyFacts(html);
    expect(facts.status?.value).toBe("Delivered");
    expect(facts.status?.confidence).toBe("Medium");
  });

  it("3. no RERA text on the page -> reraNumber genuinely MISSING, never fabricated", () => {
    const html = buildRealShapedHtml({ name: "Oberoi Springs", location: "Andheri West", projectStatus: "Completed" });
    const facts = extractOberoiRealtyFacts(html);
    expect(facts.reraNumber).toBeUndefined();
  });

  it("4. no amenities section -> amenities genuinely MISSING", () => {
    const html = buildRealShapedHtml({ name: "Some Project", location: "Andheri West" });
    const facts = extractOberoiRealtyFacts(html);
    expect(facts.amenities).toBeUndefined();
  });

  it("5. an unrecognized Project Status label (not 'Completed' or a known CONSTRUCTION_BADGE_LABEL variant) is left MISSING rather than guessed", () => {
    const html = buildRealShapedHtml({ name: "Some Project", projectStatus: "Handover Soon" });
    const facts = extractOberoiRealtyFacts(html);
    expect(facts.status).toBeUndefined();
  });

  it("6. real end-to-end classification -- feeding extracted facts through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRealShapedHtml({
      name: "Oberoi Sky Heights",
      location: "Andheri West",
      configuration: "4 BHK apartments, duplexes & penthouses",
      rera: "P518000564254",
      amenities: ["Swimming Pool"],
    });
    const facts = extractOberoiRealtyFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "Oberoi Sky Heights", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Andheri West" },
      facts,
      { url: OBEROI_SKY_HEIGHTS_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    const reraField = fields.find((f) => f.key === "reraNumber");
    expect(reraField?.classification).toBe("GREEN_NEW");
    const localityField = fields.find((f) => f.key === "locality");
    expect(localityField?.classification).toBe("CONFIRMED");
  });

  it("7. the real adapter throws distinctly on a non-OK fetch, matching every other adapter's SOURCE_UNAVAILABLE contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(oberoiRealtyAdapter.fetchProjectFacts(OBEROI_SPRINGS_PROJECT_URL)).rejects.toThrow(/500/);
    vi.unstubAllGlobals();
  });

  afterEach(() => vi.unstubAllGlobals());
});
