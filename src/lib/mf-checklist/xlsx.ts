import ExcelJS from "exceljs";
import { evidenceList, type MfChecklistWithIncludes } from "./pdf";
import type { CatalogSection } from "./catalog";
import { scoreConsideration, scoreOverall, type AnswerLite } from "./scoring";

const STATUS_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
  unanswered: "—",
};

export async function renderMfChecklistXlsx(
  a: MfChecklistWithIncludes,
  catalog: CatalogSection[],
): Promise<Buffer> {
  const byCode = new Map(a.answers.map((x) => [x.itemCode, x]));
  const considerations = catalog.flatMap((s) => s.considerations);
  const considerationScores = new Map(
    considerations.map(
      (c) =>
        [
          c.code,
          scoreConsideration(
            c.code,
            c.items.map((it) => ({
              status: (byCode.get(it.code)?.status ??
                "unanswered") as AnswerLite["status"],
            })),
          ),
        ] as const,
    ),
  );
  const overall = scoreOverall([...considerationScores.values()]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 24 }, { width: 60 }];
  const meta: [string, string][] = [
    ["MindForge Appendix H Checklist", `${a.title} (v${a.version})`],
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
  const head = summary.addRow(["Consideration", "Completion", "Conformance"]);
  head.font = { bold: true };
  for (const c of considerations) {
    const s = considerationScores.get(c.code)!;
    summary.addRow([
      `${c.code} — ${c.title}`,
      `${s.completionPct}%`,
      s.conformancePct === null ? "—" : `${s.conformancePct}%`,
    ]);
  }

  const ws = wb.addWorksheet("Checklist");
  ws.columns = [
    { header: "Section", key: "section", width: 28 },
    { header: "Consideration", key: "consideration", width: 32 },
    { header: "Item", key: "itemCode", width: 12 },
    { header: "Question", key: "question", width: 70 },
    { header: "Status", key: "status", width: 12 },
    { header: "Note", key: "note", width: 50 },
    { header: "Evidence", key: "evidence", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const s of catalog) {
    for (const c of s.considerations) {
      for (const it of c.items) {
        const ans = byCode.get(it.code);
        ws.addRow({
          section: `${s.num}. ${s.title}`,
          consideration: `${c.code} — ${c.title}`,
          itemCode: it.code,
          question: it.text,
          status: STATUS_LABEL[ans?.status ?? "unanswered"],
          note: ans?.elaboration ?? "",
          evidence: evidenceList(ans?.evidenceRefs).join(", "),
        });
      }
    }
  }
  ws.autoFilter = { from: "A1", to: "G1" };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
