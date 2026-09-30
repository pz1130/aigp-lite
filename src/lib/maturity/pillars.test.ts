import { describe, it, expect } from "vitest";
import { PILLARS, QUESTIONS, maxScoreForPillar } from "./pillars";

describe("pillars", () => {
  it("has 6 pillars", () => {
    expect(PILLARS).toHaveLength(6);
  });

  it("each pillar has at least 3 questions", () => {
    for (const p of PILLARS) {
      expect(QUESTIONS[p].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("max score reflects question count × 3", () => {
    for (const p of PILLARS) {
      expect(maxScoreForPillar(p)).toBe(QUESTIONS[p].length * 3);
    }
  });

  it("question ids are unique across all pillars", () => {
    const ids = Object.values(QUESTIONS).flatMap((qs) => qs.map((q) => q.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
