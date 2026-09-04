import { describe, expect, it } from "vitest";
import { classifyCandidateUrl } from "./projectUrlHeuristics";

describe("classifyCandidateUrl", () => {
  it("accepts a real /residential/ index-style project URL", () => {
    expect(classifyCandidateUrl("https://shapoorjirealestate.com/residential/bkc-9/").likely).toBe(true);
  });

  it("accepts a shallow distinctively-named leaf slug (Piramal-style, no index segment)", () => {
    expect(classifyCandidateUrl("https://www.piramalrealty.com/piramal-mahalaxmi").likely).toBe(true);
  });

  it("rejects a blog/news page", () => {
    expect(classifyCandidateUrl("https://d.com/blog/top-10-tips").likely).toBe(false);
  });

  it("rejects a careers page", () => {
    expect(classifyCandidateUrl("https://d.com/careers/openings").likely).toBe(false);
  });

  it("rejects a commercial-only page (residential-only discovery)", () => {
    expect(classifyCandidateUrl("https://d.com/commercial/office-tower").likely).toBe(false);
  });

  // --- Phase 56 Part B: real false-positive patterns observed in the Phase 55 run ---

  it("rejects an article page", () => {
    expect(classifyCandidateUrl("https://d.com/articles/why-mumbai-real-estate-is-booming").likely).toBe(false);
  });

  it("rejects an events/EOI-event page", () => {
    expect(classifyCandidateUrl("https://d.com/events/site-visit-weekend").likely).toBe(false);
  });

  it("rejects a video/podcast page", () => {
    expect(classifyCandidateUrl("https://d.com/videos/walkthrough-tour").likely).toBe(false);
    expect(classifyCandidateUrl("https://d.com/podcasts/episode-12").likely).toBe(false);
  });

  it("rejects a legal/policy page", () => {
    expect(classifyCandidateUrl("https://d.com/legal/cookie-policy").likely).toBe(false);
  });

  it("rejects a leadership/team page", () => {
    expect(classifyCandidateUrl("https://d.com/about/our-team").likely).toBe(false);
    expect(classifyCandidateUrl("https://d.com/board-of-directors").likely).toBe(false);
  });

  it("rejects the bare homepage", () => {
    expect(classifyCandidateUrl("https://d.com/").likely).toBe(false);
    expect(classifyCandidateUrl("https://d.com").likely).toBe(false);
  });

  it("rejects a non-page file extension", () => {
    expect(classifyCandidateUrl("https://d.com/brochure.pdf").likely).toBe(false);
    expect(classifyCandidateUrl("https://d.com/sitemap.xml").likely).toBe(false);
  });

  it("rejects a short, generic leaf slug with no positive signal", () => {
    expect(classifyCandidateUrl("https://d.com/faq").likely).toBe(false);
  });

  it("rejects a school/social-infrastructure page (real Oberoi Realty false positive from the Phase 56 rerun)", () => {
    expect(classifyCandidateUrl("https://www.oberoirealty.com/social-infrastructure/oberoi-international-school-ogc-campus-goregaon-east").likely).toBe(false);
  });

  // --- Phase 56 rerun: real negative-keyword-as-COMPOUND-slug false positives ---
  // (a negative keyword folded into a single hyphen/underscore-joined segment
  // rather than standing alone — the exact-equality check let all of these
  // through as "distinctive leaf slugs").

  it("rejects investor-relations pages (Oberoi Realty: investor-corner, shareholder-corner, financial-results)", () => {
    expect(classifyCandidateUrl("https://www.oberoirealty.com/investor-corner").likely).toBe(false);
    expect(classifyCandidateUrl("https://www.oberoirealty.com/shareholder-corner").likely).toBe(false);
    expect(classifyCandidateUrl("https://www.oberoirealty.com/financial-results").likely).toBe(false);
  });

  it("rejects a newsroom page (Rustomjee)", () => {
    expect(classifyCandidateUrl("https://www.rustomjee.com/newsroom/").likely).toBe(false);
  });

  it("rejects blog pages using a compound URL segment (blogpost, blog_detail)", () => {
    expect(classifyCandidateUrl("https://shapoorjirealestate.com/blogpost/why-bkc-is-booming").likely).toBe(false);
    expect(classifyCandidateUrl("https://www.kanakia.com/blog_detail/best-real-estate-in-andheri").likely).toBe(false);
  });

  it("rejects a commercial page using a compound URL segment (Lodha's commercial-property-in-mumbai, Hiranandani's commercial-projects)", () => {
    expect(classifyCandidateUrl("https://www.lodhagroup.com/projects/commercial-property-in-mumbai/lodha-excelus").likely).toBe(false);
    expect(classifyCandidateUrl("https://www.houseofhiranandani.com/commercial-projects").likely).toBe(false);
  });

  it("rejects a generic financing/payment-plan page (real Rustomjee false positive from the Phase 56 rerun)", () => {
    expect(classifyCandidateUrl("https://www.rustomjee.com/exclusive-payment-plan/").likely).toBe(false);
    expect(classifyCandidateUrl("https://www.rustomjee.com/exclusive-payment-plan/financing/").likely).toBe(false);
  });

  it("rejects a WordPress-style tag archive page (real MICL Group false positive from the Phase 65 rerun)", () => {
    expect(classifyCandidateUrl("https://www.micl.com/tag/aaradhya-evoq/").likely).toBe(false);
    expect(classifyCandidateUrl("https://www.micl.com/tag/micl-group/").likely).toBe(false);
  });

  it("rejects a press/timeline entry (real MICL Group false positive from the Phase 65 rerun)", () => {
    expect(classifyCandidateUrl("https://www.micl.com/timeline/launch-of-indias-tallest-residential-project-aaradhya-avaan-tardeo/").likely).toBe(false);
  });

  it("never throws on an unparseable URL", () => {
    expect(() => classifyCandidateUrl("not a url")).not.toThrow();
    expect(classifyCandidateUrl("not a url").likely).toBe(false);
  });
});
