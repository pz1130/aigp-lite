import { describe, it, expect } from "vitest";
import {
  scoreCoverage,
  computeRating,
  effectiveRating,
  RATING_SCORE,
} from "./scoring";
import { applicableItems } from "./catalog";

describe("vendor scoring", () => {
  it("full yes coverage on a tooling vendor scores 100 -> low", () => {
    const answers = [
      { itemCode: "DP-1", status: "yes" as const },
      { itemCode: "DP-2", status: "yes" as const },
      { itemCode: "DP-3", status: "yes" as const },
      { itemCode: "DP-4", status: "yes" as const },
      { itemCode: "SEC-1", status: "yes" as const },
      { itemCode: "SEC-2", status: "yes" as const },
      { itemCode: "SEC-3", status: "yes" as const },
      { itemCode: "LEG-1", status: "yes" as const },
      { itemCode: "LEG-2", status: "yes" as const },
      { itemCode: "LEG-3", status: "yes" as const },
      { itemCode: "OPS-1", status: "yes" as const },
      { itemCode: "OPS-2", status: "yes" as const },
      { itemCode: "OPS-3", status: "yes" as const },
    ];
    expect(scoreCoverage("tooling_vendor", answers)).toBe(100);
    expect(computeRating("tooling_vendor", answers)).toBe("low");
  });

  it("unanswered applicable items count as no (lowering coverage)", () => {
    // tooling_vendor has 13 applicable items; answering 3 as yes => 3/13 ~ 23
    const answers = [
      { itemCode: "DP-1", status: "yes" as const },
      { itemCode: "DP-2", status: "yes" as const },
      { itemCode: "DP-3", status: "yes" as const },
    ];
    expect(scoreCoverage("tooling_vendor", answers)).toBe(23);
    expect(computeRating("tooling_vendor", answers)).toBe("critical");
  });

  it("partial answers weight 0.5", () => {
    const answers = [
      { itemCode: "DP-1", status: "partial" as const },
      { itemCode: "DP-2", status: "partial" as const },
    ]; // 1.0 / 13 items = 8
    expect(scoreCoverage("tooling_vendor", answers)).toBe(8);
  });

  it("a 'no' on a critical item floors an otherwise-low rating to high", () => {
    // Answer everything yes except SEC-1 (critical) = no.
    const answers = [
      { itemCode: "DP-1", status: "yes" as const },
      { itemCode: "DP-2", status: "yes" as const },
      { itemCode: "DP-3", status: "yes" as const },
      { itemCode: "DP-4", status: "yes" as const },
      { itemCode: "SEC-1", status: "no" as const },
      { itemCode: "SEC-2", status: "yes" as const },
      { itemCode: "SEC-3", status: "yes" as const },
      { itemCode: "LEG-1", status: "yes" as const },
      { itemCode: "LEG-2", status: "yes" as const },
      { itemCode: "LEG-3", status: "yes" as const },
      { itemCode: "OPS-1", status: "yes" as const },
      { itemCode: "OPS-2", status: "yes" as const },
      { itemCode: "OPS-3", status: "yes" as const },
    ];
    // coverage = 12/13 = 92 -> normally low, but critical-no floors to high
    expect(scoreCoverage("tooling_vendor", answers)).toBe(92);
    expect(computeRating("tooling_vendor", answers)).toBe("high");
  });

  it("empty answers -> coverage 0 (all applicable items unanswered)", () => {
    expect(scoreCoverage("tooling_vendor", [])).toBe(0);
  });

  it("when every applicable item is N/A, coverage is 100 -> low", () => {
    const allNa = applicableItems("tooling_vendor", []).map((i) => ({
      itemCode: i.code,
      status: "not_applicable" as const,
    }));
    expect(scoreCoverage("tooling_vendor", allNa)).toBe(100);
    expect(computeRating("tooling_vendor", allNa)).toBe("low");
  });

  it("effectiveRating prefers the override", () => {
    expect(
      effectiveRating({ computedRating: "low", ratingOverride: "high" }),
    ).toBe("high");
    expect(
      effectiveRating({ computedRating: "low", ratingOverride: null }),
    ).toBe("low");
    expect(
      effectiveRating({ computedRating: null, ratingOverride: null }),
    ).toBeNull();
  });

  it("RATING_SCORE maps ratings to posture points", () => {
    expect(RATING_SCORE).toEqual({
      low: 100,
      medium: 67,
      high: 33,
      critical: 0,
    });
  });
});
