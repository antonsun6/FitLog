import { describe, expect, it } from "vitest";
import { formatWeight, kgToLb, lbToKg } from "./units";

describe("lbToKg / kgToLb", () => {
  it("converts pounds to kilograms", () => {
    expect(lbToKg(220)).toBeCloseTo(99.79, 2);
  });

  it("converts kilograms to pounds", () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 2);
  });

  it("round-trips without drift beyond floating point noise", () => {
    expect(kgToLb(lbToKg(135))).toBeCloseTo(135, 10);
  });
});

describe("formatWeight", () => {
  it("returns kg unchanged (rounded) when unit is KG", () => {
    expect(formatWeight(100.456, "KG")).toBe(100.5);
  });

  it("converts to lb when unit is LB", () => {
    expect(formatWeight(100, "LB")).toBeCloseTo(220.5, 1);
  });

  it("defaults to 1 decimal place", () => {
    expect(formatWeight(100.449, "KG")).toBe(100.4);
  });

  it("respects a custom decimals argument", () => {
    expect(formatWeight(100.456, "KG", 2)).toBe(100.46);
    expect(formatWeight(100, "KG", 0)).toBe(100);
  });
});
