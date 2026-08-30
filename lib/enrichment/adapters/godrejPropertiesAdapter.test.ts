import { afterEach, describe, expect, it, vi } from "vitest";
import { godrejPropertiesAdapter, GODREJ_SKY_SHORE_PROJECT_URL } from "./godrejPropertiesAdapter";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

const REAL_MARKUP_SNIPPET = `<!DOCTYPE html><html><head><title data-next-head="">Godrej Skyshore Versova Mumbai | 4 bed regal residences starting at ₹11.89 Cr+</title><meta name="description" content="Discover Godrej Skyshore in Versova, Andheri West, Mumbai. Explore 4 bed regal residences starting at ₹11.89 Cr+ with premium amenities, expansive decks, exceptional connectivity, and an iconic coastal lifestyle."></head><body></body></html>`;

describe("godrejPropertiesAdapter (Phase 29 Part G/H — real live adapter)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(godrejPropertiesAdapter.resolveDomain("Godrej Properties Ltd.")).toBe("https://www.godrejproperties.com");
    expect(godrejPropertiesAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("fetchProjectFacts extracts metaTitle/metaDescription from real page markup shape (data-next-head attribute on <title>)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => REAL_MARKUP_SNIPPET,
    });
    vi.stubGlobal("fetch", fetchMock);

    const facts = await godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL);

    expect(facts.metaTitle?.value).toBe("Godrej Skyshore Versova Mumbai | 4 bed regal residences starting at ₹11.89 Cr+");
    expect(facts.metaTitle?.confidence).toBe("High");
    expect(facts.metaDescription?.value).toBe(
      "Discover Godrej Skyshore in Versova, Andheri West, Mumbai. Explore 4 bed regal residences starting at ₹11.89 Cr+ with premium amenities, expansive decks, exceptional connectivity, and an iconic coastal lifestyle."
    );
    expect(fetchMock).toHaveBeenCalledWith(
      GODREJ_SKY_SHORE_PROJECT_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("merges live-extracted facts with the human-verified fixture for every other field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => REAL_MARKUP_SNIPPET })
    );

    const facts = await godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL);

    expect(facts.name).toEqual(GODREJ_SKY_SHORE_SOURCE_FACTS.name);
    expect(facts.priceMax).toEqual(GODREJ_SKY_SHORE_SOURCE_FACTS.priceMax);
    expect(facts.possessionYear).toEqual(GODREJ_SKY_SHORE_SOURCE_FACTS.possessionYear);
    expect(facts.address).toEqual(GODREJ_SKY_SHORE_SOURCE_FACTS.address);
    // Fields this adapter deliberately never fabricates a selector for (Part F) stay MISSING (undefined here).
    expect(facts.reraStatus).toBeUndefined();
    expect(facts.brochure).toBeUndefined();
  });

  it("live-extracted fact takes precedence over the fixture snapshot when both exist", async () => {
    const updatedMarkup = REAL_MARKUP_SNIPPET.replace(
      "4 bed regal residences starting at ₹11.89 Cr+</title>",
      "A brand new live title</title>"
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => updatedMarkup }));

    const facts = await godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL);
    expect(facts.metaTitle?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.metaTitle?.value);
  });

  it("throws when the page fetch returns a non-OK status, so the caller can report 'source temporarily unavailable' distinctly from 'found nothing'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL)).rejects.toThrow();
  });

  it("throws when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL)).rejects.toThrow("network down");
  });

  it("gracefully returns no title/description fact if the markup shape changes unexpectedly, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html><body>no head tags here</body></html>" }));
    const facts = await godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL);
    expect(facts.metaTitle).toEqual(GODREJ_SKY_SHORE_SOURCE_FACTS.metaTitle);
    expect(facts.metaDescription).toEqual(GODREJ_SKY_SHORE_SOURCE_FACTS.metaDescription);
  });
});
