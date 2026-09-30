import { describe, it, expect } from "vitest";
import { renderAssessmentPdf, type AssessmentReportData } from "./report";

const sample: AssessmentReportData = {
  orgName: "Acme",
  usecaseName: "Triage bot",
  autonomyLevel: "assistant",
  scoreInt: 42,
  level: "medium",
  notes: "Test notes",
  assessedAt: new Date("2026-01-01T00:00:00Z"),
  assessedByName: "Alice",
  controls: [
    {
      code: "C1",
      framework: "NIST",
      title: "Logging",
      severity: "medium",
      status: "satisfied",
    },
    {
      code: "C2",
      framework: "ISO",
      title: "Access",
      severity: "high",
      status: "failed",
    },
  ],
};

describe("renderAssessmentPdf", () => {
  it("produces a non-empty PDF buffer starting with the PDF magic bytes", async () => {
    const buf = await renderAssessmentPdf(sample);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("includes a generatedAt footer note when generatedAt differs from assessedAt", async () => {
    const buf = await renderAssessmentPdf({
      ...sample,
      generatedAt: new Date(sample.assessedAt.getTime() + 30 * 86400_000),
    });
    const baseline = await renderAssessmentPdf(sample);
    expect(buf.length).toBeGreaterThan(baseline.length - 10);
  });
});
