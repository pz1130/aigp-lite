import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { evidenceList } from "./pdf";
import { renderMfChecklistXlsx } from "./xlsx";
import { renderMfChecklistPdf } from "./pdf";
import type { MfChecklistWithIncludes } from "./pdf";
import type { CatalogSection } from "./catalog";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const catalog = [
  {
    id: "s1",
    num: 1,
    key: "governance",
    title: "Governance",
    order: 1,
    considerations: [
      {
        id: "c1",
        sectionId: "s1",
        code: "H1",
        title: "Oversight",
        order: 1,
        items: [
          {
            id: "i1",
            considerationId: "c1",
            code: "H1.1",
            text: "Is there an accountable owner?",
            guidance: null,
            order: 1,
          },
          {
            id: "i2",
            considerationId: "c1",
            code: "H1.2",
            text: "Is the review cadence defined?",
            guidance: null,
            order: 2,
          },
        ],
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
      itemCode: "H1.1",
      status: "yes",
      elaboration: "owner named",
      evidenceRefs: ["Charter doc", "Org chart"],
    },
    {
      itemCode: "H1.2",
      status: "unanswered",
      elaboration: null,
      evidenceRefs: [],
    },
  ],
} as unknown as MfChecklistWithIncludes;

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

describe("renderMfChecklistXlsx evidence column", () => {
  it("writes the joined evidence refs into the Evidence column", async () => {
    const buf = await renderMfChecklistXlsx(a, catalog);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Checklist")!;

    // Header order: Section(1) consideration(2) itemCode(3) question(4)
    // status(5) note(6) evidence(7).
    expect(ws.getRow(1).getCell(7).value).toBe("Evidence");

    const answered = ws.getRow(2);
    expect(answered.getCell(3).value).toBe("H1.1");
    expect(answered.getCell(7).value).toBe("Charter doc, Org chart");

    const empty = ws.getRow(3);
    expect(empty.getCell(3).value).toBe("H1.2");
    expect(empty.getCell(7).value).toBe("");
  });
});

describe("renderMfChecklistPdf", () => {
  it("renders a valid pdf buffer", async () => {
    const buf = await renderMfChecklistPdf(a, catalog);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
