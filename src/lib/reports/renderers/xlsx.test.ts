import { describe, it, expect } from "vitest";
import { renderXlsx } from "./xlsx";
import type { ReportData } from "../types";

const sample: ReportData = {
  template: { id: "iso-27001", displayKey: "k", version: "2022", controls: [] },
  period: { start: new Date("2026-01-01"), end: new Date("2026-03-31") },
  org: { id: "o", name: "Acme" },
  generatedAt: new Date(),
  generatedBy: { id: "u", name: "A" },
  controls: [
    {
      id: "A.8.15",
      title: "Logging",
      category: "A.8",
      description: "x",
      dataSource: "audit",
      status: "implemented",
      evidenceCount: 42,
      evidenceItems: [],
    },
    {
      id: "A.8.16",
      title: "Monitoring",
      category: "A.8",
      description: "y",
      dataSource: "incident",
      status: "implemented",
      evidenceCount: 3,
      evidenceItems: [],
    },
    {
      id: "A.5.1",
      title: "Info security policy",
      category: "A.5",
      description: "z",
      dataSource: "policy",
      status: "partial",
      evidenceCount: 0,
      evidenceItems: [],
    },
  ],
  summary: { total: 3, implemented: 2, partial: 1, notImplemented: 0, na: 0 },
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

describe("xlsx renderer", () => {
  it("produces a non-empty .xlsx (zip magic PK)", async () => {
    const buf = await renderXlsx(sample);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });
});
