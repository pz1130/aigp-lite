import { describe, it, expect } from "vitest";
import { computeStats, computeDeltas, type StatsInput } from "./stats";

const inc = (o: Partial<StatsInput>): StatsInput => ({
  category: "data_leak",
  severity: "high",
  status: "open",
  usecaseId: "u1",
  usecaseName: "Chatbot",
  frameworkRefs: {},
  ...o,
});

describe("computeStats", () => {
  it("counts by dimension and ranks use-cases", () => {
    const s = computeStats(
      [
        inc({}),
        inc({ severity: "low", status: "closed" }),
        inc({
          usecaseId: "u2",
          usecaseName: "Summarizer",
          category: "bias_harm",
        }),
      ],
      { clusteredCount: 2, longTailCount: 1 },
    );
    expect(s.total).toBe(3);
    expect(s.byCategory).toEqual({ data_leak: 2, bias_harm: 1 });
    expect(s.bySeverity).toEqual({ high: 2, low: 1 });
    expect(s.byStatus).toEqual({ open: 2, closed: 1 });
    expect(s.topUsecases[0]).toEqual({
      usecaseId: "u1",
      name: "Chatbot",
      count: 2,
    });
    expect(s.clusteredCount).toBe(2);
    expect(s.longTailCount).toBe(1);
  });

  it("rolls up framework refs across incidents", () => {
    const s = computeStats(
      [
        inc({ frameworkRefs: { EU_AI_ACT: ["Art.9", "Art.10"] } }),
        inc({ frameworkRefs: { EU_AI_ACT: ["Art.9"] } }),
      ],
      { clusteredCount: 2, longTailCount: 0 },
    );
    expect(s.frameworkRollup["EU_AI_ACT:Art.9"]).toBe(2);
    expect(s.frameworkRollup["EU_AI_ACT:Art.10"]).toBe(1);
  });
});

describe("computeDeltas", () => {
  const curr = computeStats(
    [inc({ category: "data_leak" }), inc({ category: "data_leak" })],
    { clusteredCount: 2, longTailCount: 0 },
  );

  it("marks baseline when there is no prior report", () => {
    const d = computeDeltas(curr, null);
    expect(d.baseline).toBe(true);
    expect(d.byCategory.data_leak).toEqual({
      prev: 0,
      curr: 2,
      delta: 2,
      pct: null,
    });
  });

  it("computes delta and percent vs prior", () => {
    const prior = computeStats([inc({ category: "data_leak" })], {
      clusteredCount: 1,
      longTailCount: 0,
    });
    const d = computeDeltas(curr, prior);
    expect(d.baseline).toBe(false);
    expect(d.byCategory.data_leak).toEqual({
      prev: 1,
      curr: 2,
      delta: 1,
      pct: 100,
    });
  });
});
