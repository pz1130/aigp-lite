import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderPdf } from "./pdf";
import type { ReportData } from "../types";

// @react-pdf/reconciler uses react-reconciler. When a prior test file imports
// @testing-library/react, it sets globalThis.IS_REACT_ACT_ENVIRONMENT = true,
// which makes the reconciler defer commits until act() — but @react-pdf has no
// act bridge, so container.document stays null and render() throws on .props.
// Disable the flag for this file; restore it after.
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

const sample: ReportData = {
  template: {
    id: "nist-ai-rmf",
    displayKey: "k",
    version: "1.0",
    controls: [],
  },
  period: { start: new Date("2026-01-01"), end: new Date("2026-03-31") },
  org: { id: "o", name: "Acme Corp" },
  generatedAt: new Date(),
  generatedBy: { id: "u", name: "Alice" },
  controls: [
    {
      id: "GV.OC-01",
      title: "Org context",
      category: "GOVERN",
      description: "x",
      dataSource: "narrative",
      status: "implemented",
      evidenceCount: 0,
      evidenceItems: [],
    },
    {
      id: "MP.IA-01",
      title: "Impact assessment",
      category: "MAP",
      description: "y",
      dataSource: "risk",
      status: "partial",
      evidenceCount: 0,
      evidenceItems: [],
    },
  ],
  summary: { total: 2, implemented: 1, partial: 1, notImplemented: 0, na: 0 },
  incidents: [
    {
      id: "i1",
      openedAt: new Date("2026-02-01"),
      severity: "high",
      status: "open",
      title: "Bias detected",
    },
  ],
  auditHighlights: [
    {
      id: "a1",
      action: "policy.update",
      resourceType: "policy",
      createdAt: new Date("2026-01-15"),
      actor: "user-1",
    },
  ],
};

describe("pdf renderer", () => {
  it("produces a non-empty PDF buffer starting with %PDF", async () => {
    const buf = await renderPdf(sample);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
