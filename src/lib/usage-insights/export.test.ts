import { describe, it, expect } from "vitest";
import { renderUsageInsightsPdf } from "./pdf";
import { renderUsageInsightsXlsx } from "./xlsx";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const report = {
  id: "r1",
  version: 1,
  status: "published",
  windowStart: new Date("2026-04-01"),
  windowEnd: new Date("2026-06-30"),
  k: 5,
  totalInvocations: 10,
  suppressedClusterCount: 1,
  statsJson: {
    total: 10,
    byTool: { search: 6, email: 4 },
    byOutcome: { success: 8, error: 2 },
    distinctActors: 3,
    clusteredCount: 8,
    longTailCount: 2,
  },
  deltaJson: {
    baseline: false,
    byTool: { search: { prev: 2, curr: 6, delta: 4, pct: 200 } },
    byOutcome: {},
  },
  execSummary: "Search tooling dominates consented MCP usage this quarter.",
  diagnostics: [],
} as never;
const clusters = [
  {
    id: "c1",
    themeLabel: "Data lookups",
    narrative: "n",
    systemicObservation: "obs",
    confidence: "high",
    invocationCount: 6,
    distinctActorCount: 2,
    topToolNames: [{ toolName: "search", count: 6 }],
    outcomeBreakdown: { success: 5, error: 1 },
    isLongTail: false,
  },
] as never;

describe("usage-insights exports", () => {
  it("renders a non-empty PDF buffer", async () => {
    const buf = await renderUsageInsightsPdf(report, clusters);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
  it("renders a non-empty XLSX buffer", async () => {
    const buf = await renderUsageInsightsXlsx(report, clusters);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
