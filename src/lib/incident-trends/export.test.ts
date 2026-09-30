import { describe, it, expect } from "vitest";
import { renderTrendsPdf } from "./pdf";
import { renderTrendsXlsx } from "./xlsx";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const report = {
  id: "r1",
  version: 1,
  status: "published",
  windowStart: new Date("2026-04-01"),
  windowEnd: new Date("2026-06-30"),
  statsJson: {
    total: 5,
    byCategory: { data_leak: 3 },
    bySeverity: { high: 5 },
    byStatus: { open: 5 },
    topUsecases: [],
    frameworkRollup: {},
    clusteredCount: 4,
    longTailCount: 1,
  },
  deltaJson: {
    baseline: false,
    byCategory: { data_leak: { prev: 1, curr: 3, delta: 2, pct: 200 } },
    bySeverity: {},
  },
  execSummary: "Systemic data-leak pattern across the chatbot estate.",
  diagnostics: [],
} as never;
const clusters = [
  {
    id: "c1",
    label: "Data leak via tools",
    narrative: "n",
    systemicRecommendation: "fix",
    confidence: "high",
    memberIncidentIds: ["a", "b"],
    memberCount: 2,
    isLongTail: false,
    dominantCategory: "data_leak",
    dominantSeverity: "high",
  },
] as never;

describe("incident-trends exports", () => {
  it("renders a non-empty PDF buffer", async () => {
    const buf = await renderTrendsPdf(report, clusters);
    expect(buf.length).toBeGreaterThan(1000);
  });
  it("renders a non-empty XLSX buffer", async () => {
    const buf = await renderTrendsXlsx(report, clusters);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
