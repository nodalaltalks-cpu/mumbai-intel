import { describe, expect, it } from "vitest";
import { detectMmrPeripheralArea } from "./mmrBoundary";

describe("detectMmrPeripheralArea", () => {
  it("detects Thane", () => {
    expect(detectMmrPeripheralArea("Ghodbunder Road, Thane")).toBe("thane");
  });

  it("detects Navi Mumbai", () => {
    expect(detectMmrPeripheralArea("Sector 20, Navi Mumbai")).toBe("navi mumbai");
  });

  it("detects Kalyan-Dombivli variants", () => {
    expect(detectMmrPeripheralArea("Kalyan West")).toBe("kalyan");
    expect(detectMmrPeripheralArea("Dombivli East")).toBe("dombivli");
  });

  it("detects Mira Road / Bhayandar", () => {
    expect(detectMmrPeripheralArea("Mira Road")).toBe("mira road");
    expect(detectMmrPeripheralArea("Bhayandar West")).toBe("bhayandar");
  });

  it("detects Vasai-Virar", () => {
    expect(detectMmrPeripheralArea("Nalasopara East")).toBe("nalasopara");
    expect(detectMmrPeripheralArea("Virar West")).toBe("virar");
  });

  it("detects Panvel and Navi Mumbai nodes", () => {
    expect(detectMmrPeripheralArea("Panvel")).toBe("panvel");
    expect(detectMmrPeripheralArea("Kharghar")).toBe("kharghar");
  });

  it("detects Khopoli -- a real gap found by the Phase 67 Housiey feasibility investigation", () => {
    expect(detectMmrPeripheralArea("Khopoli")).toBe("khopoli");
  });

  it("returns null for genuine Mumbai-city text", () => {
    expect(detectMmrPeripheralArea("Andheri West")).toBeNull();
    expect(detectMmrPeripheralArea("Dahisar")).toBeNull();
    expect(detectMmrPeripheralArea("Chembur, Mumbai")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(detectMmrPeripheralArea("THANE")).toBe("thane");
  });

  it("does not match a keyword as a mere substring of an unrelated word", () => {
    expect(detectMmrPeripheralArea("Panvelwadi Society Road")).toBeNull();
  });

  it("returns null for empty/unrelated text", () => {
    expect(detectMmrPeripheralArea("")).toBeNull();
    expect(detectMmrPeripheralArea("Some Totally Unrelated Neighbourhood")).toBeNull();
  });
});
