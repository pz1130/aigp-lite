import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseExcel, parseMarkdown } from "./parse";

describe("risk import parsing", () => {
  it("parses controls from an xlsx buffer", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Controls");
    worksheet.addRow(["Code", "Title", "Description", "Severity"]);
    worksheet.addRow([
      "R-1",
      "Access review",
      "Review access quarterly",
      "high",
    ]);
    worksheet.addRow(["R-2", "Logging", "Keep audit logs", "unsupported"]);

    const buffer = await workbook.xlsx.writeBuffer();
    await expect(parseExcel(Buffer.from(buffer))).resolves.toEqual([
      {
        code: "R-1",
        title: "Access review",
        description: "Review access quarterly",
        severity: "high",
      },
      {
        code: "R-2",
        title: "Logging",
        description: "Keep audit logs",
        severity: "medium",
      },
    ]);
  });

  it("parses markdown tables and defaults unknown severity", () => {
    expect(
      parseMarkdown(
        [
          "| Code | Title | Description | Severity |",
          "| --- | --- | --- | --- |",
          "| R-1 | Access review | Review access quarterly | high |",
        ].join("\n"),
      ),
    ).toEqual([
      {
        code: "R-1",
        title: "Access review",
        description: "Review access quarterly",
        severity: "high",
      },
    ]);
  });
});
