import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderModelCardPdf } from "./pdf";
import type { ModelCardData } from "./aggregator";

// @react-pdf/reconciler defers commits when IS_REACT_ACT_ENVIRONMENT is set
// (any @testing-library/react import earlier in the run leaves it true).
// Scope the flag off for this file; the M9 pdf test does the same.
let prevActEnv: unknown;
beforeAll(() => {
  prevActEnv = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown })
    .IS_REACT_ACT_ENVIRONMENT;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
  ).IS_REACT_ACT_ENVIRONMENT = false;
});
afterAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
  ).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
});

const sample: ModelCardData = {
  usecase: {
    id: "u1",
    name: "Loan Approval",
    lifecycleStage: "production",
    autonomyLevel: "assistant",
    deploymentType: "built",
    description: "Approves consumer loans under $50k.",
  },
  inventory: { ownerName: "Alice", ownerEmail: "alice@example.com" },
  risk: {
    topRisks: [
      {
        id: "r1",
        title: "Bias risk",
        severity: "high",
        assessedAt: new Date("2026-04-15"),
      },
    ],
  },
  evaluations: [
    {
      id: "e1",
      createdAt: new Date("2026-05-01"),
      model: "gpt-4o-mini",
      totalPrompts: 20,
      passedCount: 18,
      failedCount: 2,
      errorCount: 0,
    },
  ],
  knownLimitations: "Cannot make legal judgments.",
  generatedAt: new Date("2026-05-17"),
  generatedBy: { id: "u", name: "Test User" },
};

describe("renderModelCardPdf", () => {
  it("emits a non-empty buffer starting with %PDF", async () => {
    const buf = await renderModelCardPdf(sample);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("handles empty risk and evaluation arrays", async () => {
    const buf = await renderModelCardPdf({
      ...sample,
      risk: { topRisks: [] },
      evaluations: [],
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
