import ExcelJS from "exceljs";
import type { IncidentTrendReport, IncidentTrendCluster } from "@/lib/prisma";
import type { TrendStats, TrendDeltas } from "./stats";

export async function renderTrendsXlsx(
  report: IncidentTrendReport,
  clusters: IncidentTrendCluster[],
): Promise<Buffer> {
  const stats = report.statsJson as unknown as TrendStats;
  const deltas = report.deltaJson as unknown as TrendDeltas | null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  // --- Summary sheet ---
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 60 }];
  const meta: [string, string | number][] = [
    ["Incident Trends Report", `v${report.version}`],
    ["Status", report.status],
    ["Window start", report.windowStart.toISOString().slice(0, 10)],
    ["Window end", report.windowEnd.toISOString().slice(0, 10)],
    ["Total incidents", stats.total],
    ["Clustered", stats.clusteredCount],
    ["Long-tail", stats.longTailCount],
  ];
  for (const [label, value] of meta) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.getRow(1).font = { bold: true, size: 14 };

  // Severity counts
  summary.addRow([]);
  const sevHeader = summary.addRow(["Severity", "Count"]);
  sevHeader.font = { bold: true };
  for (const [k, v] of Object.entries(stats.bySeverity)) {
    summary.addRow([k, v]);
  }

  // Category counts
  summary.addRow([]);
  const catHeader = summary.addRow(["Category", "Count"]);
  catHeader.font = { bold: true };
  for (const [k, v] of Object.entries(stats.byCategory)) {
    summary.addRow([k, v]);
  }

  // Deltas
  if (deltas) {
    summary.addRow([]);
    const deltaHeader = summary.addRow([
      "Category deltas (prev → curr)",
      "Delta",
      "% Change",
    ]);
    deltaHeader.font = { bold: true };
    for (const [k, v] of Object.entries(deltas.byCategory)) {
      summary.addRow([
        k,
        `${v.prev} → ${v.curr}`,
        v.pct != null ? `${v.pct}%` : "baseline",
      ]);
    }

    summary.addRow([]);
    const sevDeltaHeader = summary.addRow([
      "Severity deltas (prev → curr)",
      "Delta",
      "% Change",
    ]);
    sevDeltaHeader.font = { bold: true };
    for (const [k, v] of Object.entries(deltas.bySeverity)) {
      summary.addRow([
        k,
        `${v.prev} → ${v.curr}`,
        v.pct != null ? `${v.pct}%` : "baseline",
      ]);
    }
  }

  // --- Clusters sheet ---
  const clustersWs = wb.addWorksheet("Clusters");
  clustersWs.columns = [
    { header: "Label", key: "label", width: 32 },
    { header: "Member count", key: "memberCount", width: 14 },
    { header: "Dominant category", key: "dominantCategory", width: 22 },
    { header: "Dominant severity", key: "dominantSeverity", width: 18 },
    { header: "Confidence", key: "confidence", width: 12 },
    {
      header: "Systemic recommendation",
      key: "systemicRecommendation",
      width: 50,
    },
    { header: "Long tail", key: "isLongTail", width: 10 },
  ];
  clustersWs.getRow(1).font = { bold: true };
  for (const c of clusters) {
    clustersWs.addRow({
      label: c.label || (c.isLongTail ? "(long tail)" : ""),
      memberCount: c.memberCount,
      dominantCategory: c.dominantCategory ?? "",
      dominantSeverity: c.dominantSeverity,
      confidence: c.confidence,
      systemicRecommendation: c.systemicRecommendation,
      isLongTail: c.isLongTail ? "yes" : "no",
    });
  }
  clustersWs.autoFilter = { from: "A1", to: "G1" };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
