import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { renderAivtfXlsx } from "./xlsx";
import type { AivtfWithIncludes } from "./pdf";
import type { CatalogPrinciple } from "./catalog";

const catalog: CatalogPrinciple[] = [
  {
    id: "p1",
    num: 1,
    key: "transparency",
    title: "Transparency",
    blurb: null,
    order: 1,
    outcomes: [
      {
        id: "o1",
        principleId: "p1",
        code: "1.1",
        text: "Disclosure",
        order: 1,
        processes: [
          {
            id: "pr1",
            outcomeId: "o1",
            code: "1.1.1",
            text: "Policy",
            typeOfAI: "ALL",
            evidenceType: "Doc",
            evidenceGuidance: null,
            order: 1,
          },
          {
            id: "pr2",
            outcomeId: "o1",
            code: "1.1.2",
            text: "Disclosure notice",
            typeOfAI: "GENAI_ONLY",
            evidenceType: "Screenshot",
            evidenceGuidance: null,
            order: 2,
          },
        ],
      },
    ],
  },
];

const a = {
  id: "a1",
  orgId: "o1",
  usecaseId: null,
  version: 2,
  status: "approved",
  title: "Test",
  createdById: "u1",
  submittedAt: null,
  submittedById: null,
  approvedAt: new Date("2026-06-14T00:00:00Z"),
  approvedById: "u2",
  archivedAt: null,
  archivedById: null,
  supersededById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  org: { id: "o1", name: "Acme" },
  usecase: null,
  createdBy: { id: "u1", name: "Jo", email: "jo@x.io" },
  approvedBy: { id: "u2", name: "Al", email: "al@x.io" },
  answers: [{ processCode: "1.1.1", status: "yes", elaboration: "ok" }],
} as unknown as AivtfWithIncludes;

describe("renderAivtfXlsx", () => {
  it("renders a valid xlsx buffer with Summary + Checklist sheets", async () => {
    const buf = await renderAivtfXlsx(a, catalog);
    // xlsx files are zip archives → start with the PK signature
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Summary")).toBeDefined();
    expect(wb.getWorksheet("Checklist")).toBeDefined();
  });

  it("writes one checklist row per process with mapped status + note", async () => {
    const buf = await renderAivtfXlsx(a, catalog);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Checklist")!;

    // header + 2 process rows
    expect(ws.rowCount).toBe(3);

    // After load, column keys are not persisted in the xlsx → address by index
    // (processCode=4, status=8, note=9).
    const answered = ws.getRow(2);
    expect(answered.getCell(4).value).toBe("1.1.1");
    expect(answered.getCell(8).value).toBe("Yes");
    expect(answered.getCell(9).value).toBe("ok");

    const unanswered = ws.getRow(3);
    expect(unanswered.getCell(4).value).toBe("1.1.2");
    expect(unanswered.getCell(8).value).toBe("—");
  });
});
