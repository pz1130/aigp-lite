import type { TrendStats, TrendDeltas } from "./stats";
import type { TrendsConfig } from "./config";

export const HIGH_SEVERITY_BUCKETS = ["critical", "high"] as const;

export type TrendAlertSignal =
  | { code: "total_increase"; params: { delta: number; pct: number } }
  | { code: "severity_increase"; params: { bucket: string; delta: number } }
  | { code: "category_increase"; params: { category: string; delta: number } }
  | {
      code: "large_severe_cluster";
      params: { label: string; memberCount: number };
    };

export interface TrendAlertClusterInput {
  label: string;
  memberCount: number;
  dominantSeverity: string;
  isLongTail: boolean;
}

export interface TrendAlertInput {
  stats: TrendStats;
  deltas: TrendDeltas;
  clusters: TrendAlertClusterInput[];
  config: TrendsConfig;
}

const HIGH_SEVERITY = HIGH_SEVERITY_BUCKETS as readonly string[];

export function evaluateTrendAlerts(
  input: TrendAlertInput,
): TrendAlertSignal[] {
  const { stats, deltas, clusters, config } = input;
  if (deltas.baseline) return [];

  const signals: TrendAlertSignal[] = [];

  // total_increase — TrendDeltas carries no total cell, so derive the prior
  // total from the bySeverity prev cells; current total is stats.total.
  const prevTotal = Object.values(deltas.bySeverity).reduce(
    (sum, cell) => sum + cell.prev,
    0,
  );
  const totalDelta = stats.total - prevTotal;
  const totalPct =
    prevTotal === 0 ? null : Math.round((totalDelta / prevTotal) * 100);
  if (
    totalDelta >= config.alertMinIncidentFloor &&
    totalPct !== null &&
    totalPct >= config.alertTotalIncreasePct
  ) {
    signals.push({
      code: "total_increase",
      params: { delta: totalDelta, pct: totalPct },
    });
  }

  // severity_increase — only critical/high buckets
  for (const bucket of HIGH_SEVERITY_BUCKETS) {
    const cell = deltas.bySeverity[bucket];
    if (cell && cell.delta >= config.alertMinIncidentFloor) {
      signals.push({
        code: "severity_increase",
        params: { bucket, delta: cell.delta },
      });
    }
  }

  // category_increase — any category at/above the floor
  for (const [category, cell] of Object.entries(deltas.byCategory)) {
    if (cell.delta >= config.alertMinIncidentFloor) {
      signals.push({
        code: "category_increase",
        params: { category, delta: cell.delta },
      });
    }
  }

  // large_severe_cluster — big, non-long-tail, high/critical clusters
  for (const c of clusters) {
    if (
      !c.isLongTail &&
      c.memberCount >= config.alertClusterMinSize &&
      HIGH_SEVERITY.includes(c.dominantSeverity)
    ) {
      signals.push({
        code: "large_severe_cluster",
        params: { label: c.label, memberCount: c.memberCount },
      });
    }
  }

  return signals;
}
