import { describe, it, expect } from "vitest";
import {
  IMPACT_DIMENSIONS,
  autonomyBand,
  impactBand,
  TIER_MATRIX,
  TIER_WEIGHT,
  computeTier,
  effectiveTier,
} from "./rubric";

describe("impactBand", () => {
  it("is the max of the four inputs (highest harm dominates)", () => {
    expect(
      impactBand({
        affectedParties: 0,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      }),
    ).toBe(0);
    expect(
      impactBand({
        affectedParties: 1,
        decisionConsequence: 0,
        financialSafety: 3,
        dataSensitivity: 2,
      }),
    ).toBe(3);
    expect(
      impactBand({
        affectedParties: 2,
        decisionConsequence: 2,
        financialSafety: 1,
        dataSensitivity: 0,
      }),
    ).toBe(2);
  });
});

describe("autonomyBand", () => {
  it("maps each autonomy level to 0..3", () => {
    expect(autonomyBand("assistant")).toBe(0);
    expect(autonomyBand("simple_agent")).toBe(1);
    expect(autonomyBand("collaborative_agent")).toBe(2);
    expect(autonomyBand("agent_ecosystem")).toBe(3);
  });
});

describe("TIER_MATRIX", () => {
  it("matches the shipped 4x4 default (impactBand x autonomyBand)", () => {
    expect(TIER_MATRIX).toEqual([
      ["minimal", "minimal", "limited", "limited"],
      ["minimal", "limited", "limited", "high"],
      ["limited", "high", "high", "critical"],
      ["high", "high", "critical", "critical"],
    ]);
  });

  it("critical requires both high impact and high autonomy", () => {
    expect(TIER_MATRIX[3][0]).toBe("high");
    expect(TIER_MATRIX[0][3]).toBe("limited");
    expect(TIER_MATRIX[3][3]).toBe("critical");
  });
});

describe("computeTier", () => {
  it("crosses impact band and autonomy band through the matrix", () => {
    const r = computeTier(
      {
        affectedParties: 2,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
      "simple_agent",
    );
    expect(r).toEqual({ tier: "high", impactBand: 2, autonomyBand: 1 });
  });

  it("a throwaway internal assistant is minimal", () => {
    expect(
      computeTier(
        {
          affectedParties: 0,
          decisionConsequence: 0,
          financialSafety: 0,
          dataSensitivity: 0,
        },
        "assistant",
      ).tier,
    ).toBe("minimal");
  });

  it("a public autonomous decision system is critical", () => {
    expect(
      computeTier(
        {
          affectedParties: 3,
          decisionConsequence: 3,
          financialSafety: 2,
          dataSensitivity: 3,
        },
        "agent_ecosystem",
      ).tier,
    ).toBe("critical");
  });
});

describe("effectiveTier", () => {
  it("returns the override when present, else the computed tier", () => {
    expect(effectiveTier({ computedTier: "limited", tierOverride: null })).toBe(
      "limited",
    );
    expect(
      effectiveTier({ computedTier: "limited", tierOverride: "critical" }),
    ).toBe("critical");
  });
});

describe("TIER_WEIGHT", () => {
  it("is geometric so a critical gap dominates a minimal one", () => {
    expect(TIER_WEIGHT).toEqual({
      minimal: 1,
      limited: 2,
      high: 4,
      critical: 8,
    });
  });
});

describe("IMPACT_DIMENSIONS", () => {
  it("describes the four owner-answered inputs with 4 option labels each", () => {
    expect(IMPACT_DIMENSIONS).toHaveLength(4);
    expect(IMPACT_DIMENSIONS.map((d) => d.key)).toEqual([
      "affectedParties",
      "decisionConsequence",
      "financialSafety",
      "dataSensitivity",
    ]);
    for (const d of IMPACT_DIMENSIONS) {
      expect(d.options).toHaveLength(4);
    }
  });
});
