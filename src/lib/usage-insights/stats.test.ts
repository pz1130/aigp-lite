import { describe, it, expect } from "vitest";
import { computeStats, computeDeltas } from "./stats";

const rows = [
  { toolName: "search", outcome: "success", actorId: "a" },
  { toolName: "search", outcome: "error", actorId: "a" },
  { toolName: "email", outcome: "success", actorId: "b" },
];

describe("computeStats", () => {
  it("aggregates tools, outcomes, distinct actors", () => {
    const s = computeStats(rows, { clusteredCount: 2, longTailCount: 1 });
    expect(s.total).toBe(3);
    expect(s.byTool.search).toBe(2);
    expect(s.byOutcome.error).toBe(1);
    expect(s.distinctActors).toBe(2);
    expect(s.clusteredCount).toBe(2);
  });
});

describe("computeDeltas", () => {
  it("marks baseline when no prior", () => {
    const s = computeStats(rows, { clusteredCount: 2, longTailCount: 1 });
    expect(computeDeltas(s, null).baseline).toBe(true);
  });
  it("computes tool deltas vs prior", () => {
    const curr = computeStats(rows, { clusteredCount: 2, longTailCount: 1 });
    const prior = computeStats(
      [{ toolName: "search", outcome: "success", actorId: "z" }],
      { clusteredCount: 0, longTailCount: 1 },
    );
    const d = computeDeltas(curr, prior);
    expect(d.baseline).toBe(false);
    expect(d.byTool.search.delta).toBe(1);
  });
});
