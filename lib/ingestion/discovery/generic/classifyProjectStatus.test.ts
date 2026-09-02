import { describe, expect, it } from "vitest";
import { classifyGenericProjectStatus } from "./classifyProjectStatus";

describe("classifyGenericProjectStatus", () => {
  it("classifies explicit CURRENT evidence (under construction)", () => {
    expect(classifyGenericProjectStatus("under construction", true).bucket).toBe("CURRENT");
  });

  it("classifies explicit CURRENT evidence (newly launched)", () => {
    expect(classifyGenericProjectStatus("newly launched", true).bucket).toBe("CURRENT");
  });

  it("classifies explicit CURRENT evidence (expression of interest)", () => {
    expect(classifyGenericProjectStatus("expression of interest", true).bucket).toBe("CURRENT");
  });

  it("classifies explicit EXCLUDE evidence (sold out)", () => {
    expect(classifyGenericProjectStatus("sold out", true).bucket).toBe("EXCLUDE");
  });

  it("classifies explicit EXCLUDE evidence (completed)", () => {
    expect(classifyGenericProjectStatus("completed", true).bucket).toBe("EXCLUDE");
  });

  it("classifies pre-launch/coming-soon as REVIEW, never CURRENT or EXCLUDE", () => {
    expect(classifyGenericProjectStatus("pre-launch", true).bucket).toBe("REVIEW");
    expect(classifyGenericProjectStatus("coming soon", true).bucket).toBe("REVIEW");
  });

  it("classifies NO evidence at all as REVIEW, never CURRENT — a page existing is not proof of current status", () => {
    const result = classifyGenericProjectStatus(null, true);
    expect(result.bucket).toBe("REVIEW");
    expect(result.evidence).toMatch(/no explicit status phrase/i);
  });

  it("classifies a non-project page (no project-shaped signal at all) as EXCLUDE", () => {
    const result = classifyGenericProjectStatus(null, false);
    expect(result.bucket).toBe("EXCLUDE");
    expect(result.evidence).toMatch(/no project-shaped signal/i);
  });

  it("does not treat bare 'ready to move' as proof of completion — routes to REVIEW", () => {
    expect(classifyGenericProjectStatus("ready to move", true).bucket).toBe("REVIEW");
  });
});
