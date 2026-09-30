import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { evidenceList } from "./pdf";
import { renderAsiChecklistXlsx } from "./xlsx";
import { renderAsiChecklistPdf } from "./pdf";
import type { AsiChecklistWithIncludes } from "./pdf";
import type { CatalogSection } from "./catalog";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const catalog = [
  {
    id: "s1",
    num: 1,
    key: "asi01",
    asiCode: "ASI01",
    title: "Agent Authorization Hijacking",
    order: 1,
    crossLinks: {
      atlas: ["AML.T0051"],
      llmTop10: ["LLM01"],
      agenticThreats: [],
      aivss: [],
    },
    items: [
      {
        id: "i1",
        sectionId: "s1",
        code: "ASI01.1",
        text: "Test privilege boundaries.",
        guidance: null,
        order: 1,
      },
      {
        id: "i2",
        sectionId: "s1",
        code: "ASI01.2",
        text: "Verify scope enforcement.",
        guidance: null,
        order: 2,
      },
    ],
  },
] as unknown as CatalogSection[];

const a = {
  id: "a1",
  orgId: "o1",
  usecaseId: null,
  version: 1,
  status: "draft",
  title: "Test",
  createdById: "u1",
  submittedAt: null,
  submittedById: null,
  approvedAt: null,
  approvedById: null,
  archivedAt: null,
  archivedById: null,
  supersededById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  org: { id: "o1", name: "Acme" },
  usecase: null,
  createdBy: { id: "u1", name: "Jo", email: "jo@x.io" },
  answers: [
    {
      itemCode: "ASI01.1",
      status: "yes",
      elaboration: "tested",
      evidenceRefs: ["Pentest report", "Trace log"],
    },
    {
      itemCode: "ASI01.2",
      status: "unanswered",
      elaboration: null,
      evidenceRefs: [],
    },
  ],
} as unknown as AsiChecklistWithIncludes;

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

describe("renderAsiChecklistXlsx evidence column", () => {
  it("writes the joined evidence refs into the Evidence column", async () => {
    const buf = await renderAsiChecklistXlsx(a, catalog);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Checklist")!;

    // Header order: Section(1) Item(2) status(3) procedure(4) crossLinks(5)
    // note(6) evidence(7).
    expect(ws.getRow(1).getCell(7).value).toBe("Evidence");

    const answered = ws.getRow(2);
    expect(answered.getCell(2).value).toBe("ASI01.1");
    expect(answered.getCell(7).value).toBe("Pentest report, Trace log");

    const empty = ws.getRow(3);
    expect(empty.getCell(2).value).toBe("ASI01.2");
    expect(empty.getCell(7).value).toBe("");
  });
});

describe("renderAsiChecklistPdf", () => {
  it("renders a valid pdf buffer", async () => {
    const buf = await renderAsiChecklistPdf(a, catalog);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
