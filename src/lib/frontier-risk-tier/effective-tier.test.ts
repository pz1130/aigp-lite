import { describe, it, expect } from "vitest";
import { deriveEffectiveTier } from "./effective-tier";

describe("deriveEffectiveTier", () => {
  it("returns unassessed when answers is null", () => {
    expect(deriveEffectiveTier(null)).toEqual({
      assessed: false,
      tier: null,
    });
  });

  it("returns tier 0 when assessed but nothing is met", () => {
    expect(
      deriveEffectiveTier([
        { status: "na", tier: 3 },
        { status: "not_met", tier: 2 },
        { status: "unanswered", tier: 1 },
      ]),
    ).toEqual({ assessed: true, tier: 0 });
  });

  it("returns max met tier across categories", () => {
    expect(
      deriveEffectiveTier([
        { status: "met", tier: 3 },
        { status: "met", tier: 1 },
        { status: "not_met", tier: 2 },
      ]),
    ).toEqual({ assessed: true, tier: 3 });
  });

  it("returns tier 1 for a single tier-1 met answer", () => {
    expect(deriveEffectiveTier([{ status: "met", tier: 1 }])).toEqual({
      assessed: true,
      tier: 1,
    });
  });
});
