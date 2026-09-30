import { describe, it, expect } from "vitest";
import { aggregateToIncident } from "./incident-aggregator";
import type { PersistableFinding } from "./runner";

function fail(
  severity: string,
  category: string,
  reason = "",
): PersistableFinding {
  return {
    promptRef: "x",
    promptText: "x",
    category,
    severity,
    response: "",
    judgment: "fail",
    judgmentReason: reason,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

describe("aggregateToIncident", () => {
  it("returns null when there are no failures", () => {
    expect(
      aggregateToIncident({
        totalPrompts: 10,
        passedCount: 10,
        failedCount: 0,
        errorCount: 0,
        findings: [],
        evaluationId: "e1",
        model: "m",
        connectionId: "c1",
      }),
    ).toBeNull();
  });

  it("picks the max severity across failed findings", () => {
    const r = aggregateToIncident({
      totalPrompts: 10,
      passedCount: 7,
      failedCount: 3,
      errorCount: 0,
      findings: [
        fail("low", "bias"),
        fail("critical", "jailbreak"),
        fail("high", "harmful"),
      ],
      evaluationId: "e1",
      model: "gpt-4o",
      connectionId: "c1",
    });
    expect(r?.severity).toBe("critical");
    expect(r?.title).toContain("3/10");
    expect(r?.title).toContain("gpt-4o");
  });

  it("counts top categories in descending order", () => {
    const r = aggregateToIncident({
      totalPrompts: 10,
      passedCount: 7,
      failedCount: 3,
      errorCount: 0,
      findings: [
        fail("high", "bias"),
        fail("high", "bias"),
        fail("high", "jailbreak"),
      ],
      evaluationId: "e1",
      model: "m",
      connectionId: "c1",
    });
    const notes = JSON.parse(r!.notes);
    expect(notes.topCategories[0]).toEqual({ category: "bias", count: 2 });
    expect(notes.topCategories[1]).toEqual({ category: "jailbreak", count: 1 });
  });

  it("caps topFindings at 10", () => {
    const findings = Array.from({ length: 15 }, (_, i) =>
      fail("medium", "bias", `r${i}`),
    );
    const r = aggregateToIncident({
      totalPrompts: 15,
      passedCount: 0,
      failedCount: 15,
      errorCount: 0,
      findings,
      evaluationId: "e1",
      model: "m",
      connectionId: "c1",
    });
    const notes = JSON.parse(r!.notes);
    expect(notes.topFindings).toHaveLength(10);
  });

  it("source is redteam and category is ai_trust", () => {
    const r = aggregateToIncident({
      totalPrompts: 1,
      passedCount: 0,
      failedCount: 1,
      errorCount: 0,
      findings: [fail("medium", "harmful")],
      evaluationId: "e1",
      model: "m",
      connectionId: "c1",
    });
    expect(r?.source).toBe("redteam");
    expect(r?.category).toBe("ai_trust");
  });
});
