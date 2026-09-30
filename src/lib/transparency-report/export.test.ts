import { describe, it, expect } from "vitest";
import { renderTxrPdf, type TxrReportWithIncludes } from "./pdf";
import { renderTxrXlsx } from "./xlsx";
import type { TxrSnapshot } from "./aggregate";
import type { TxrOrgSnapshot } from "./org-aggregate";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const snapshot: TxrSnapshot = {
  frt: {
    found: true,
    assessmentId: "a",
    version: 1,
    overallTier: 2,
    byCategory: [
      {
        code: "CYBER",
        title: "Cyber offense",
        assignedTier: 2,
        completionPct: 100,
      },
    ],
  },
  tierDeltas: {
    priorEdition: { version: 1, periodLabel: "2025 H2" },
    overall: { from: 1, to: 2 },
    byCategory: [{ code: "CYBER", from: 1, to: 2, direction: "up" }],
  },
  incidents: {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-06-30T00:00:00.000Z",
    total: 3,
    bySeverity: { low: 1, medium: 0, high: 1, critical: 1 },
    byCategory: { data_leak: 2, uncategorized: 1 },
  },
  drift: {
    latestRun: {
      id: "r",
      avgScore: 7.5,
      degraded: false,
      completedAt: "2026-05-01T00:00:00.000Z",
    },
    runsInPeriod: 2,
    degradedRunsInPeriod: 0,
  },
  posture: { score: 82 },
  generatedAt: "2026-06-30T00:00:00.000Z",
};

const orgSnapshot: TxrOrgSnapshot = {
  portfolio: [
    {
      usecaseId: "u1",
      name: "Alpha",
      ownerName: "Alice",
      isHighRisk: true,
      euAiActCategory: "high",
      frtTier: 2,
      readinessState: "not_ready",
      blockingCheckIds: ["fria"],
      incidents: {
        total: 1,
        bySeverity: { low: 0, medium: 0, high: 1, critical: 0 },
      },
    },
    {
      usecaseId: "u2",
      name: "Beta",
      ownerName: "Bob",
      isHighRisk: false,
      euAiActCategory: "minimal",
      frtTier: 0,
      readinessState: "conditionally_ready",
      blockingCheckIds: [],
      incidents: {
        total: 0,
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      },
    },
  ],
  totals: {
    systemCount: 2,
    byReadiness: {
      ready: 0,
      conditionally_ready: 1,
      not_ready: 1,
      live: 0,
    },
    highRiskBlocked: 1,
    worstTier: 2,
    tierDistribution: { "0": 1, "1": 0, "2": 1, "3": 0 },
    incidents: {
      total: 1,
      bySeverity: { low: 0, medium: 0, high: 1, critical: 0 },
      byCategory: { uncategorized: 1 },
    },
  },
  drift: {
    latestRun: {
      id: "r",
      avgScore: 7.5,
      degraded: false,
      completedAt: "2026-05-01T00:00:00.000Z",
    },
    runsInPeriod: 1,
    degradedRunsInPeriod: 0,
  },
  posture: { score: 75 },
  deltas: {
    priorEdition: null,
    systemCount: { from: 2, to: 2 },
    worstTier: { from: 2, to: 2 },
    byReadiness: {
      ready: { from: 0, to: 0 },
      conditionally_ready: { from: 1, to: 1 },
      not_ready: { from: 1, to: 1 },
      live: { from: 0, to: 0 },
    },
    incidentsTotal: { from: 1, to: 1 },
  },
  generatedAt: "2026-06-30T00:00:00.000Z",
};

const report = {
  id: "x",
  title: "2026 H1 model report",
  version: 2,
  status: "published",
  periodLabel: "2026 H1",
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-06-30"),
  sections: {
    system_description: "A frontier model.",
    safeguards: "Filters and oversight.",
    evaluations: "Red-team run.",
    governance: "Board reviewed.",
    changes_note: "Cyber tier rose.",
  },
  approvedAt: new Date("2026-06-29"),
  publishedAt: new Date("2026-06-30"),
  org: { id: "o", name: "Acme" },
  usecase: null,
  createdBy: { id: "c", name: "Creator", email: "c@t.local" },
  approvedBy: { id: "a", name: "Approver", email: "a@t.local" },
  publishedBy: { id: "p", name: "Publisher", email: "p@t.local" },
} as unknown as TxrReportWithIncludes;

describe("txr export", () => {
  it("renders a non-empty PDF buffer", async () => {
    const buf = await renderTxrPdf(report, snapshot);
    expect(buf.length).toBeGreaterThan(1000);
  });
  it("renders a non-empty XLSX buffer", async () => {
    const buf = await renderTxrXlsx(report, snapshot);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders a portfolio PDF for an org-level snapshot", async () => {
    const buf = await renderTxrPdf(report, orgSnapshot);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("still renders a legacy monolithic snapshot without a portfolio key", async () => {
    const buf = await renderTxrPdf(report, snapshot);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders a portfolio Excel workbook for an org-level snapshot", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const buf = await renderTxrXlsx(report, orgSnapshot);
    const wb = new ExcelJS.Workbook();
    // exceljs typings expect Node Buffer; vitest returns a compatible Uint8Array-backed buffer
    await wb.xlsx.load(buf as never);
    expect(wb.getWorksheet("Portfolio")).toBeTruthy();
  });
});
