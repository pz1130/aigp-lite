import ExcelJS from "exceljs";
import { evidenceList, type AgenticGovWithIncludes } from "./pdf";
import type { CatalogSection } from "./catalog";
import { scoreSection, scoreOverall, type AnswerLite } from "./scoring";

const STATUS_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
  unanswered: "—",
};

export async function renderAgenticGovXlsx(
  a: AgenticGovWithIncludes,
  catalog: CatalogSection[],
): Promise<Buffer> {
  const byCode = new Map(a.answers.map((x) => [x.itemCode, x]));
  const sectionScores = new Map(
    catalog.map(
      (s) =>
        [
          s.key,
          scoreSection(
            s.key,
            s.items.map((it) => ({
              status: (byCode.get(it.code)?.status ??
                "unanswered") as AnswerLite["status"],
            })),
          ),
        ] as const,
    ),
  );
  const overall = scoreOverall([...sectionScores.values()]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 24 }, { width: 60 }];
  const meta: [string, string][] = [
    ["Agentic Governance Checklist", `${a.title} (v${a.version})`],
    ["Organization", a.org.name],
    ["Scope", a.usecase ? `Usecase — ${a.usecase.name}` : "Organization-level"],
    ["Status", a.status],
    ["Created by", `${a.createdBy.name} (${a.createdBy.email})`],
  ];
  if (a.approvedBy) {
    meta.push([
      "Approved by",
      `${a.approvedBy.name} on ${a.approvedAt?.toISOString().slice(0, 10) ?? ""}`,
    ]);
  }
  meta.push(["Overall completion", `${overall.completionPct}%`]);
  meta.push([
    "Overall conformance",
    overall.conformancePct === null ? "—" : `${overall.conformancePct}%`,
  ]);
  for (const [label, value] of meta) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.getRow(1).font = { bold: true, size: 14 };

  summary.addRow([]);
  const head = summary.addRow(["Section", "Completion", "Conformance"]);
  head.font = { bold: true };
  for (const s of catalog) {
    const sc = sectionScores.get(s.key)!;
    summary.addRow([
      `${s.num}. ${s.title}`,
      `${sc.completionPct}%`,
      sc.conformancePct === null ? "—" : `${sc.conformancePct}%`,
    ]);
  }

  const ws = wb.addWorksheet("Checklist");
  ws.columns = [
    { header: "Section", key: "section", width: 28 },
    { header: "Item", key: "itemCode", width: 12 },
    { header: "Section intent", key: "intent", width: 40 },
    { header: "Status", key: "status", width: 12 },
    { header: "Procedure", key: "procedure", width: 70 },
    { header: "See also", key: "seeAlso", width: 40 },
    { header: "Note", key: "note", width: 50 },
    { header: "Evidence", key: "evidence", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const s of catalog) {
    const seeAlsoText = s.seeAlso.map((x) => x.labelEn).join(", ");
    for (const it of s.items) {
      const ans = byCode.get(it.code);
      ws.addRow({
        section: `${s.num}. ${s.title}`,
        itemCode: it.code,
        intent: s.intent,
        status: STATUS_LABEL[ans?.status ?? "unanswered"],
        procedure: it.text,
        seeAlso: seeAlsoText,
        note: ans?.elaboration ?? "",
        evidence: evidenceList(ans?.evidenceRefs).join(", "),
      });
    }
  }
  ws.autoFilter = { from: "A1", to: "H1" };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
