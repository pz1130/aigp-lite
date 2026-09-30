import { describe, it, expect } from "vitest";
import {
  scoreCategory,
  scoreOverall,
  tierReached,
  tierLabel,
  type AnswerLite,
} from "./scoring";

const a = (tier: number, status: AnswerLite["status"]): AnswerLite => ({
  tier,
  status,
});

describe("tierReached", () => {
  it("is true only when a threshold in that tier is met", () => {
    const ans = [a(1, "met"), a(2, "not_met"), a(3, "na")];
    expect(tierReached(ans, 1)).toBe(true);
    expect(tierReached(ans, 2)).toBe(false);
    expect(tierReached(ans, 3)).toBe(false);
  });
});

describe("scoreCategory", () => {
  it("assigns the highest tier that has a met threshold", () => {
    const ans = [a(1, "met"), a(2, "met"), a(3, "not_met")];
    const s = scoreCategory("CYBER", ans);
    expect(s.assignedTier).toBe(2);
    expect(s.met).toBe(2);
    expect(s.notMet).toBe(1);
  });

  it("counts a high tier even when lower tiers are na/not_met", () => {
    const ans = [a(1, "na"), a(2, "not_met"), a(3, "met")];
    expect(scoreCategory("CBRN", ans).assignedTier).toBe(3);
  });

  it("treats all-na as tier 0 with 100% completion", () => {
    const ans = [a(1, "na"), a(2, "na"), a(3, "na")];
    const s = scoreCategory("MANIPULATION", ans);
    expect(s.assignedTier).toBe(0);
    expect(s.completionPct).toBe(100);
    expect(s.answered).toBe(3);
  });

  it("does not throw on unanswered and excludes them from completion", () => {
    const ans = [a(1, "met"), a(2, "unanswered")];
    const s = scoreCategory("LOSS_OF_CONTROL", ans);
    expect(s.unanswered).toBe(1);
    expect(s.completionPct).toBe(50);
    expect(s.assignedTier).toBe(1);
  });

  it("handles an empty category", () => {
    const s = scoreCategory("CYBER", []);
    expect(s).toMatchObject({ total: 0, completionPct: 0, assignedTier: 0 });
  });
});

describe("scoreOverall", () => {
  it("takes the max assigned tier and sums counts", () => {
    const c1 = scoreCategory("CYBER", [a(1, "met")]);
    const c2 = scoreCategory("CBRN", [a(3, "met")]);
    const o = scoreOverall([c1, c2]);
    expect(o.assignedTier).toBe(3);
    expect(o.met).toBe(2);
    expect(o.total).toBe(2);
  });

  it("is tier 0 when no category reaches a tier", () => {
    const c = scoreCategory("CYBER", [a(1, "not_met"), a(2, "na")]);
    expect(scoreOverall([c]).assignedTier).toBe(0);
  });
});

describe("tierLabel", () => {
  it("labels tier 0 as Not reached", () => {
    expect(tierLabel(0)).toBe("Not reached");
    expect(tierLabel(2)).toBe("Tier 2");
  });
});
