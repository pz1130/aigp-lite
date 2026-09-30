import { describe, it, expect } from "vitest";
import { scoreConsideration, scoreOverall, type AnswerLite } from "./scoring";

const a = (status: AnswerLite["status"]): AnswerLite => ({ status });

describe("scoreConsideration", () => {
  it("computes completion and conformance, excluding na from conformance denominator", () => {
    const s = scoreConsideration("C1", [a("yes"), a("no"), a("na")]);
    expect(s).toMatchObject({
      considerationCode: "C1",
      total: 3,
      answered: 3,
      yes: 1,
      no: 1,
      na: 1,
      unanswered: 0,
      completionPct: 100,
      conformancePct: 50,
    });
  });

  it("returns null conformance when there are no yes/no answers", () => {
    const s = scoreConsideration("C2", [a("na"), a("unanswered")]);
    expect(s.conformancePct).toBeNull();
    expect(s.completionPct).toBe(50);
  });

  it("handles an all-unanswered consideration", () => {
    const s = scoreConsideration("C3", [a("unanswered"), a("unanswered")]);
    expect(s).toMatchObject({
      completionPct: 0,
      conformancePct: null,
      answered: 0,
    });
  });
});

describe("scoreOverall", () => {
  it("aggregates across considerations", () => {
    const c1 = scoreConsideration("C1", [a("yes"), a("yes")]);
    const c2 = scoreConsideration("C2", [a("no"), a("na")]);
    const o = scoreOverall([c1, c2]);
    expect(o).toMatchObject({
      total: 4,
      answered: 4,
      yes: 2,
      no: 1,
      na: 1,
      unanswered: 0,
      completionPct: 100,
      conformancePct: 67,
    });
  });
});
