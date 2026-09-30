import ExcelJS from "exceljs";
import type { UsageInsightReport, UsageInsightCluster } from "@/lib/prisma";
import type { UsageStats, UsageDeltas } from "./stats";

export async function renderUsageInsightsXlsx(
  report: UsageInsightReport,
  clusters: UsageInsightCluster[],
): Promise<Buffer> {
  const stats = report.statsJson as unknown as UsageStats;
  const deltas = report.deltaJson as unknown as UsageDeltas | null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "AIGP-Lite";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 60 }];
  const meta: [string, string | number][] = [
    ["Usage Insights Report", `v${report.version}`],
    ["Status", report.status],
    ["Window start", report.windowStart.toISOString().slice(0, 10)],
    ["Window end", report.windowEnd.toISOString().slice(0, 10)],
    ["k-anonymity floor", report.k],
    ["Total invocations", report.totalInvocations],
    ["Suppressed clusters", report.suppressedClusterCount],
    ["Clustered", stats.clusteredCount],
    ["Long-tail", stats.longTailCount],
    ["Distinct actors", stats.distinctActors],
  ];
  for (const [label, value] of meta) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.getRow(1).font = { bold: true, size: 14 };

  summary.addRow([]);
  summary.addRow(["Executive summary", report.execSummary || "—"]);

  summary.addRow([]);
  const toolHeader = summary.addRow(["Tool", "Count"]);
  toolHeader.font = { bold: true };
  for (const [k, v] of Object.entries(stats.byTool)) {
    summary.addRow([k, v]);
  }

  summary.addRow([]);
  const outcomeHeader = summary.addRow(["Outcome", "Count"]);
  outcomeHeader.font = { bold: true };
  for (const [k, v] of Object.entries(stats.byOutcome)) {
    summary.addRow([k, v]);
  }

  if (deltas) {
    summary.addRow([]);
    const deltaHeader = summary.addRow([
      "Tool deltas (prev → curr)",
      "Delta",
      "% Change",
    ]);
    deltaHeader.font = { bold: true };
    for (const [k, v] of Object.entries(deltas.byTool)) {
      summary.addRow([
        k,
        `${v.prev} → ${v.curr}`,
        v.pct != null ? `${v.pct}%` : "baseline",
      ]);
    }
  }

  const clustersWs = wb.addWorksheet("Clusters");
  clustersWs.columns = [
    { header: "Theme", key: "themeLabel", width: 32 },
    { header: "Invocations", key: "invocationCount", width: 14 },
    { header: "Distinct actors", key: "distinctActorCount", width: 16 },
    { header: "Top tool", key: "topTool", width: 22 },
    { header: "Outcome breakdown", key: "outcomeBreakdown", width: 40 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Systemic observation", key: "systemicObservation", width: 50 },
    { header: "Long tail", key: "isLongTail", width: 10 },
  ];
  clustersWs.getRow(1).font = { bold: true };
  for (const c of clusters.filter((x) => !x.isLongTail)) {
    const topTools = c.topToolNames as unknown as {
      toolName: string;
      count: number;
    }[];
    clustersWs.addRow({
      themeLabel: c.themeLabel || "",
      invocationCount: c.invocationCount,
      distinctActorCount: c.distinctActorCount,
      topTool: topTools.length > 0 ? topTools[0].toolName : "",
      outcomeBreakdown: JSON.stringify(c.outcomeBreakdown),
      confidence: c.confidence,
      systemicObservation: c.systemicObservation,
      isLongTail: c.isLongTail ? "yes" : "no",
    });
  }
  clustersWs.autoFilter = { from: "A1", to: "H1" };

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
