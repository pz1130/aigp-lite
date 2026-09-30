export interface StatsInput {
  category: string | null;
  severity: string;
  status: string;
  usecaseId: string | null;
  usecaseName: string | null;
  frameworkRefs: Record<string, string[]>;
}

export interface TrendStats {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  topUsecases: { usecaseId: string; name: string; count: number }[];
  frameworkRollup: Record<string, number>;
  clusteredCount: number;
  longTailCount: number;
}

export interface DeltaCell {
  prev: number;
  curr: number;
  delta: number;
  pct: number | null;
}

export interface TrendDeltas {
  baseline: boolean;
  byCategory: Record<string, DeltaCell>;
  bySeverity: Record<string, DeltaCell>;
}

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

export function computeStats(
  incidents: StatsInput[],
  clustering: { clusteredCount: number; longTailCount: number },
): TrendStats {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const frameworkRollup: Record<string, number> = {};
  const ucCount = new Map<string, { name: string; count: number }>();

  for (const i of incidents) {
    if (i.category) bump(byCategory, i.category);
    bump(bySeverity, i.severity);
    bump(byStatus, i.status);
    if (i.usecaseId) {
      const cur = ucCount.get(i.usecaseId) ?? {
        name: i.usecaseName ?? i.usecaseId,
        count: 0,
      };
      cur.count += 1;
      ucCount.set(i.usecaseId, cur);
    }
    for (const [fw, refs] of Object.entries(i.frameworkRefs ?? {})) {
      for (const ref of refs) bump(frameworkRollup, `${fw}:${ref}`);
    }
  }

  const topUsecases = [...ucCount.entries()]
    .map(([usecaseId, v]) => ({ usecaseId, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.usecaseId.localeCompare(b.usecaseId))
    .slice(0, 10);

  return {
    total: incidents.length,
    byCategory,
    bySeverity,
    byStatus,
    topUsecases,
    frameworkRollup,
    clusteredCount: clustering.clusteredCount,
    longTailCount: clustering.longTailCount,
  };
}

function deltaMap(
  curr: Record<string, number>,
  prev: Record<string, number>,
  baseline: boolean,
): Record<string, DeltaCell> {
  const out: Record<string, DeltaCell> = {};
  const keys = new Set([...Object.keys(curr), ...Object.keys(prev)]);
  for (const k of keys) {
    const c = curr[k] ?? 0;
    const p = prev[k] ?? 0;
    out[k] = {
      prev: p,
      curr: c,
      delta: c - p,
      pct: baseline || p === 0 ? null : Math.round(((c - p) / p) * 100),
    };
  }
  return out;
}

export function computeDeltas(
  curr: TrendStats,
  prior: TrendStats | null,
): TrendDeltas {
  const baseline = prior === null;
  const prev = prior ?? { byCategory: {}, bySeverity: {} };
  return {
    baseline,
    byCategory: deltaMap(curr.byCategory, prev.byCategory, baseline),
    bySeverity: deltaMap(curr.bySeverity, prev.bySeverity, baseline),
  };
}
