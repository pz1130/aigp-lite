import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { evidenceList } from "./pdf";
import { renderAgenticGovXlsx } from "./xlsx";
import { renderAgenticGovPdf } from "./pdf";
import type { AgenticGovWithIncludes } from "./pdf";
import type { CatalogSection } from "./catalog";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const catalog = [
  {
    id: "s1",
    num: 1,
    key: "ag1",
    title: "Accountability",
    intent: "Clear ownership of the agent.",
    seeAlso: [{ slug: "mcp", labelEn: "MCP Trust", labelZh: "MCP 信任" }],
    order: 1,
    items: [
      {
        id: "i1",
        sectionId: "s1",
        code: "AG1.1",
        text: "Name an accountable owner.",
        guidance: null,
        order: 1,
      },
      {
        id: "i2",
        sectionId: "s1",
        code: "AG1.2",
        text: "Document escalation paths.",
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
      itemCode: "AG1.1",
      status: "yes",
      elaboration: "owner assigned",
      evidenceRefs: ["RACI matrix", "Owner email"],
    },
    {
      itemCode: "AG1.2",
      status: "unanswered",
      elaboration: null,
      evidenceRefs: [],
    },
  ],
} as unknown as AgenticGovWithIncludes;

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

describe("renderAgenticGovXlsx evidence column", () => {
  it("writes the joined evidence refs into the Evidence column", async () => {
    const buf = await renderAgenticGovXlsx(a, catalog);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Checklist")!;

    // Header order: Section(1) Item(2) intent(3) status(4) procedure(5)
    // seeAlso(6) note(7) evidence(8).
    expect(ws.getRow(1).getCell(8).value).toBe("Evidence");

    const answered = ws.getRow(2);
    expect(answered.getCell(2).value).toBe("AG1.1");
    expect(answered.getCell(8).value).toBe("RACI matrix, Owner email");

    const empty = ws.getRow(3);
    expect(empty.getCell(2).value).toBe("AG1.2");
    expect(empty.getCell(8).value).toBe("");
  });
});

describe("renderAgenticGovPdf", () => {
  it("renders a valid pdf buffer", async () => {
    const buf = await renderAgenticGovPdf(a, catalog);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
