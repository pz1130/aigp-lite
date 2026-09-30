import ExcelJS from "exceljs";
import type { AivtfWithIncludes } from "./pdf";
import type { CatalogPrinciple } from "./catalog";
import { scorePrinciple, scoreOverall, type AnswerLite } from "./scoring";

const STATUS_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
  unanswered: "—",
};

export async function renderAivtfXlsx(
  a: AivtfWithIncludes,
  catalog: CatalogPrinciple[],
): Promise<Buffer> {
  const byCode = new Map(a.answers.map((x) => [x.processCode, x]));
  const principleScores = catalog.map((p) =>
    scorePrinciple(
      p.num,
      p.outcomes
        .flatMap((o) => o.processes)
        .map((pr) => ({
          status: (byCode.get(pr.code)?.status ??
            "unanswered") as AnswerLite["status"],
        })),
    ),
  );
  const overall = scoreOverall(principleScores);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  // --- Summary sheet -------------------------------------------------------
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 24 }, { width: 60 }];
  const meta: [string, string][] = [
    ["AIVTF Process Checklist", `${a.title} (v${a.version})`],
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
  const head = summary.addRow(["Principle", "Completion", "Conformance"]);
  head.font = { bold: true };
  catalog.forEach((p, i) => {
    const s = principleScores[i];
    summary.addRow([
      `${p.num}. ${p.title}`,
      `${s.completionPct}%`,
      s.conformancePct === null ? "—" : `${s.conformancePct}%`,
    ]);
  });

  // --- Checklist sheet -----------------------------------------------------
  const ws = wb.addWorksheet("Checklist");
  ws.columns = [
    { header: "Principle", key: "principle", width: 28 },
    { header: "Outcome", key: "outcomeCode", width: 10 },
    { header: "Outcome text", key: "outcomeText", width: 40 },
    { header: "Process", key: "processCode", width: 12 },
    { header: "Requirement", key: "processText", width: 60 },
    { header: "Type of AI", key: "typeOfAI", width: 12 },
    { header: "Evidence", key: "evidenceType", width: 18 },
    { header: "Status", key: "status", width: 12 },
    { header: "Note", key: "note", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const p of catalog) {
    for (const o of p.outcomes) {
      for (const pr of o.processes) {
        const ans = byCode.get(pr.code);
        ws.addRow({
          principle: `${p.num}. ${p.title}`,
          outcomeCode: o.code,
          outcomeText: o.text,
          processCode: pr.code,
          processText: pr.text,
          typeOfAI: pr.typeOfAI ?? "",
          evidenceType: pr.evidenceType ?? "",
          status: STATUS_LABEL[ans?.status ?? "unanswered"],
          note: ans?.elaboration ?? "",
        });
      }
    }
  }
  ws.autoFilter = { from: "A1", to: "I1" };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
