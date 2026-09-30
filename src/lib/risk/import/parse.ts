import ExcelJS from "exceljs";
import type { RawControl } from "./prompt";

export async function parseExcel(buffer: Buffer): Promise<RawControl[]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS ships a module-local Buffer declaration that is narrower than
  // Node's Buffer generic. Copy into a plain ArrayBuffer before the boundary
  // so parsing does not depend on an `any` cast or a shared backing buffer.
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  await wb.xlsx.load(
    arrayBuffer as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const controls: RawControl[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const code = String(row.getCell(1).value ?? "").trim();
    const title = String(row.getCell(2).value ?? "").trim();
    const description = String(row.getCell(3).value ?? "").trim();
    const severityRaw = String(row.getCell(4).value ?? "medium")
      .trim()
      .toLowerCase();
    const severity = ["low", "medium", "high"].includes(severityRaw)
      ? (severityRaw as RawControl["severity"])
      : "medium";
    if (code && title) {
      controls.push({ code, title, description, severity });
    }
  });
  return controls;
}

export function parseMarkdown(text: string): RawControl[] {
  const controls: RawControl[] = [];

  // Try parsing markdown table format
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let inTable = false;
  let headerSeen = false;

  for (const line of lines) {
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());

      if (!headerSeen) {
        headerSeen = true;
        inTable = true;
        continue;
      }
      if (cells.every((c) => /^[-:]+$/.test(c))) continue; // separator row

      if (inTable && cells.length >= 2) {
        const code = cells[0] ?? "";
        const title = cells[1] ?? "";
        const description = cells[2] ?? "";
        const severityRaw = (cells[3] ?? "medium").toLowerCase();
        const severity = ["low", "medium", "high"].includes(severityRaw)
          ? (severityRaw as RawControl["severity"])
          : "medium";
        if (code && title) {
          controls.push({ code, title, description, severity });
        }
      }
    } else {
      inTable = false;
      headerSeen = false;
    }
  }
  return controls;
}
