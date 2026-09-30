import { describe, it, expect } from "vitest";
import { scoreSection, scoreOverall, type AnswerLite } from "./scoring";

const a = (status: AnswerLite["status"]): AnswerLite => ({ status });

describe("scoreSection", () => {
  it("computes completion and conformance, excluding na from the conformance denominator", () => {
    const s = scoreSection("ag1-tool-access", [a("yes"), a("no"), a("na")]);
    expect(s).toMatchObject({
      sectionKey: "ag1-tool-access",
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
    const s = scoreSection("ag2-traceability", [a("na"), a("unanswered")]);
    expect(s.conformancePct).toBeNull();
    expect(s.completionPct).toBe(50);
  });

  it("handles an all-unanswered section", () => {
    const s = scoreSection("ag3-oversight", [a("unanswered"), a("unanswered")]);
    expect(s).toMatchObject({
      completionPct: 0,
      conformancePct: null,
      answered: 0,
    });
  });
});

describe("scoreOverall", () => {
  it("aggregates across sections", () => {
    const c1 = scoreSection("ag1", [a("yes"), a("yes")]);
    const c2 = scoreSection("ag2", [a("no"), a("na")]);
    const o = scoreOverall([c1, c2]);
    expect(o).toMatchObject({
      total: 4,
      answered: 4,
      yes: 2,
      no: 1,
      na: 1,
      conformancePct: 67,
    });
  });
});
