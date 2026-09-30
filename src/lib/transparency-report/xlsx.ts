import ExcelJS from "exceljs";
import type { TxrReportWithIncludes } from "./pdf";
import type { TxrSnapshot } from "./aggregate";
import type { TxrOrgSnapshot } from "./org-aggregate";

const tierLabel = (n: number) => (n === 0 ? "Not reached" : `Tier ${n}`);

export async function renderTxrXlsx(
  report: TxrReportWithIncludes,
  snapshot: TxrSnapshot | TxrOrgSnapshot,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  if ("portfolio" in snapshot) {
    const sheet = wb.addWorksheet("Portfolio");
    sheet.addRow(["System", "FRT tier", "Readiness", "Incidents (in period)"]);
    for (const p of snapshot.portfolio) {
      sheet.addRow([
        p.name,
        p.frtTier === 0 ? "Not reached" : `Tier ${p.frtTier}`,
        p.readinessState,
        p.incidents.total,
      ]);
    }
    const summary = wb.addWorksheet("Summary");
    const t = snapshot.totals;
    summary.addRow(["System count", t.systemCount]);
    summary.addRow(["Worst tier", t.worstTier]);
    summary.addRow(["High-risk blocked", t.highRiskBlocked]);
    summary.addRow(["Ready", t.byReadiness.ready]);
    summary.addRow(["Conditionally ready", t.byReadiness.conditionally_ready]);
    summary.addRow(["Not ready", t.byReadiness.not_ready]);
    summary.addRow(["Live", t.byReadiness.live]);
    summary.addRow(["Incidents (in period)", t.incidents.total]);
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 60 }];
  const meta: [string, string][] = [
    [
      "Transparency Report",
      `${report.title} (${report.periodLabel}, v${report.version})`,
    ],
    ["Organization", report.org.name],
    [
      "Scope",
      report.usecase
        ? `Usecase — ${report.usecase.name}`
        : "Organization-level",
    ],
    ["Status", report.status],
    ["Overall systemic-risk tier", tierLabel(snapshot.frt.overallTier)],
    ["Posture score", String(snapshot.posture.score)],
    ["Incidents in period", String(snapshot.incidents.total)],
  ];
  for (const [label, value] of meta) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.getRow(1).font = { bold: true, size: 14 };

  const tiers = wb.addWorksheet("Tiers");
  tiers.columns = [
    { header: "Category", key: "category", width: 28 },
    { header: "Assigned tier", key: "tier", width: 16 },
    { header: "Completion", key: "pct", width: 14 },
    { header: "Prior tier", key: "prior", width: 14 },
    { header: "Delta", key: "delta", width: 10 },
  ];
  tiers.getRow(1).font = { bold: true };
  const deltaByCode = new Map(
    snapshot.tierDeltas.byCategory.map((d) => [d.code, d]),
  );
  for (const c of snapshot.frt.byCategory) {
    const d = deltaByCode.get(c.code);
    tiers.addRow({
      category: c.title,
      tier: tierLabel(c.assignedTier),
      pct: `${c.completionPct}%`,
      prior: d ? tierLabel(d.from) : "",
      delta: d ? d.direction : "",
    });
  }
  tiers.autoFilter = { from: "A1", to: "E1" };

  const inc = wb.addWorksheet("Incidents");
  inc.columns = [
    { header: "Dimension", key: "k", width: 24 },
    { header: "Value", key: "v", width: 16 },
  ];
  inc.getRow(1).font = { bold: true };
  inc.addRow({ k: "Total", v: snapshot.incidents.total });
  for (const sev of ["critical", "high", "medium", "low"] as const) {
    inc.addRow({
      k: `Severity: ${sev}`,
      v: snapshot.incidents.bySeverity[sev],
    });
  }
  for (const [k, v] of Object.entries(snapshot.incidents.byCategory)) {
    inc.addRow({ k: `Category: ${k}`, v });
  }

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
