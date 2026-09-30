import { describe, it, expect } from "vitest";
import { scorePrinciple, scoreOverall, type AnswerLite } from "./scoring";

const A = (status: AnswerLite["status"]): AnswerLite => ({ status });

describe("scorePrinciple", () => {
  it("computes completion and conformance, excluding N/A from conformance", () => {
    const r = scorePrinciple(7, [
      A("yes"),
      A("yes"),
      A("no"),
      A("na"),
      A("unanswered"),
    ]);
    expect(r).toMatchObject({
      principleNum: 7,
      total: 5,
      answered: 4,
      yes: 2,
      no: 1,
      na: 1,
      unanswered: 1,
    });
    expect(r.completionPct).toBe(80); // 4/5
    expect(r.conformancePct).toBe(67); // 2/3 rounded
  });

  it("conformance is null when no yes/no answers", () => {
    const r = scorePrinciple(2, [A("na"), A("unanswered")]);
    expect(r.conformancePct).toBeNull();
    expect(r.completionPct).toBe(50);
  });
});

describe("scoreOverall", () => {
  it("aggregates across principles", () => {
    const o = scoreOverall([
      scorePrinciple(1, [A("yes"), A("no")]),
      scorePrinciple(2, [A("yes"), A("na")]),
    ]);
    expect(o.total).toBe(4);
    expect(o.answered).toBe(4);
    expect(o.yes).toBe(2);
    expect(o.completionPct).toBe(100);
    expect(o.conformancePct).toBe(67); // 2 yes / 3 (yes+no)
  });
});
