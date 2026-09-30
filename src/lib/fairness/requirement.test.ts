import { describe, it, expect } from "vitest";
import {
  isFairnessRequired,
  fairnessReqState,
  REQUIRED_TIERS,
} from "./requirement";

describe("fairness requirement gate", () => {
  it("requires fairness for high and critical tiers", () => {
    expect(REQUIRED_TIERS.has("high")).toBe(true);
    expect(REQUIRED_TIERS.has("critical")).toBe(true);
    expect(REQUIRED_TIERS.has("limited")).toBe(false);
  });

  it("uses the effective tier (override wins)", () => {
    expect(
      isFairnessRequired({ computedTier: "limited", tierOverride: "high" }),
    ).toBe(true);
    expect(
      isFairnessRequired({ computedTier: "critical", tierOverride: "minimal" }),
    ).toBe(false);
  });

  it("is false for an unscored use case (null materiality)", () => {
    expect(isFairnessRequired(null)).toBe(false);
  });

  it("fairnessReqState reports required + effective tier", () => {
    expect(
      fairnessReqState({ computedTier: "high", tierOverride: null }),
    ).toEqual({ required: true, tier: "high" });
    expect(fairnessReqState(null)).toEqual({ required: false, tier: null });
  });
});
