import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  renderFrtPdf,
  evidenceList,
  type FrtAssessmentWithIncludes,
} from "./pdf";
import { renderFrtXlsx } from "./xlsx";
import type { CategoryWithThresholds } from "./catalog";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const catalog: CategoryWithThresholds[] = [
  {
    id: "c1",
    code: "CYBER",
    order: 1,
    title: "Cyber offense",
    summary: "s",
    thresholds: [
      {
        id: "t1",
        categoryId: "c1",
        code: "FRT-CYBER-T1-1",
        tier: 1,
        order: 1,
        statement: "alpha",
        guidance: "g",
      },
      {
        id: "t2",
        categoryId: "c1",
        code: "FRT-CYBER-T3-1",
        tier: 3,
        order: 1,
        statement: "beta",
        guidance: null,
      },
    ],
  } as unknown as CategoryWithThresholds,
];

const assessment = {
  id: "a1",
  title: "Demo",
  version: 1,
  status: "approved",
  approvedAt: new Date("2026-06-21"),
  org: { id: "o1", name: "Acme" },
  usecase: null,
  createdBy: { id: "u1", name: "Pat", email: "pat@x.io" },
  submittedBy: null,
  approvedBy: { id: "u2", name: "Sam", email: "sam@x.io" },
  answers: [
    {
      thresholdCode: "FRT-CYBER-T1-1",
      status: "met",
      elaboration: "seen in lab",
      evidenceRefs: ["Eval run #42", "Red-team log"],
    },
    {
      thresholdCode: "FRT-CYBER-T3-1",
      status: "not_met",
      elaboration: null,
      evidenceRefs: [],
    },
  ],
} as unknown as FrtAssessmentWithIncludes;

describe("evidenceList", () => {
  it("returns the string entries of an array", () => {
    expect(evidenceList(["a", "b"])).toEqual(["a", "b"]);
  });

  it("filters out non-strings and blanks", () => {
    expect(evidenceList(["a", 1, "", "  ", null, "b"])).toEqual(["a", "b"]);
  });

  it("returns [] for non-array input", () => {
    expect(evidenceList(undefined)).toEqual([]);
    expect(evidenceList(null)).toEqual([]);
    expect(evidenceList("x")).toEqual([]);
  });
});

describe("FRT exporters", () => {
  it("renders a non-empty PDF buffer", async () => {
    const buf = await renderFrtPdf(assessment, catalog);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("renders a non-empty XLSX buffer", async () => {
    const buf = await renderFrtXlsx(assessment, catalog);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("writes the joined evidence refs into the Evidence column", async () => {
    const buf = await renderFrtXlsx(assessment, catalog);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Thresholds")!;

    // Header order: Category(1) Tier(2) code(3) statement(4) status(5)
    // note(6) evidence(7).
    expect(ws.getRow(1).getCell(7).value).toBe("Evidence");

    const answered = ws.getRow(2);
    expect(answered.getCell(3).value).toBe("FRT-CYBER-T1-1");
    expect(answered.getCell(7).value).toBe("Eval run #42, Red-team log");

    const empty = ws.getRow(3);
    expect(empty.getCell(3).value).toBe("FRT-CYBER-T3-1");
    expect(empty.getCell(7).value).toBe("");
  });
});
