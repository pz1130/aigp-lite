import ExcelJS from "exceljs";

export async function generateExcelTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";

  const ws = wb.addWorksheet("Controls");
  ws.columns = [
    { header: "Code", key: "code", width: 16 },
    { header: "Title", key: "title", width: 40 },
    { header: "Description", key: "description", width: 60 },
    { header: "Severity", key: "severity", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };

  ws.addRow({
    code: "CTRL-001",
    title: "Example control title",
    description: "Detailed description of what this control requires.",
    severity: "medium",
  });

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export function generateMarkdownTemplate(): string {
  return `# Control Import Template

Fill in the table below with your controls. Each row represents one control.

| Code | Title | Description | Severity |
|------|-------|-------------|----------|
| CTRL-001 | Example control title | Detailed description of what this control requires. | medium |

**Severity values:** low, medium, high

**Tips:**
- Code should be a unique identifier within the framework
- Title should be a concise summary (max 200 characters)
- Description can be the full control requirement text
- Leave severity as "medium" if unsure
`;
}
