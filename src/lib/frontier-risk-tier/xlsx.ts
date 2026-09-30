import ExcelJS from "exceljs";
import { evidenceList, type FrtAssessmentWithIncludes } from "./pdf";
import type { CategoryWithThresholds } from "./catalog";
import {
  scoreCategory,
  scoreOverall,
  tierLabel,
  type AnswerLite,
} from "./scoring";

const STATUS_LABEL: Record<string, string> = {
  met: "Met",
  not_met: "Not met",
  na: "N/A",
  unanswered: "—",
};

function answersFor(
  c: CategoryWithThresholds,
  byCode: Map<string, AnswerLite["status"]>,
): AnswerLite[] {
  return c.thresholds.map((th) => ({
    tier: th.tier,
    status: byCode.get(th.code) ?? "unanswered",
  }));
}

export async function renderFrtXlsx(
  a: FrtAssessmentWithIncludes,
  catalog: CategoryWithThresholds[],
): Promise<Buffer> {
  const byCode = new Map(
    a.answers.map((x) => [x.thresholdCode, x.status as AnswerLite["status"]]),
  );
  const ansRow = new Map(a.answers.map((x) => [x.thresholdCode, x]));
  const catScores = new Map(
    catalog.map((c) => [c.code, scoreCategory(c.code, answersFor(c, byCode))]),
  );
  const overall = scoreOverall([...catScores.values()]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 60 }];
  const meta: [string, string][] = [
    ["Frontier Risk Tier Assessment", `${a.title} (v${a.version})`],
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
  meta.push(["Overall assigned tier", tierLabel(overall.assignedTier)]);
  meta.push(["Overall completion", `${overall.completionPct}%`]);
  for (const [label, value] of meta) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.getRow(1).font = { bold: true, size: 14 };

  summary.addRow([]);
  const head = summary.addRow(["Category", "Assigned tier", "Completion"]);
  head.font = { bold: true };
  for (const c of catalog) {
    const sc = catScores.get(c.code)!;
    summary.addRow([
      c.title,
      tierLabel(sc.assignedTier),
      `${sc.completionPct}%`,
    ]);
  }

  const ws = wb.addWorksheet("Thresholds");
  ws.columns = [
    { header: "Category", key: "category", width: 28 },
    { header: "Tier", key: "tier", width: 8 },
    { header: "Threshold", key: "code", width: 24 },
    { header: "Statement", key: "statement", width: 70 },
    { header: "Status", key: "status", width: 12 },
    { header: "Note", key: "note", width: 50 },
    { header: "Evidence", key: "evidence", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const c of catalog) {
    for (const th of c.thresholds) {
      const ans = ansRow.get(th.code);
      ws.addRow({
        category: c.title,
        tier: th.tier,
        code: th.code,
        statement: th.statement,
        status: STATUS_LABEL[ans?.status ?? "unanswered"],
        note: ans?.elaboration ?? "",
        evidence: evidenceList(ans?.evidenceRefs).join(", "),
      });
    }
  }
  ws.autoFilter = { from: "A1", to: "G1" };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
