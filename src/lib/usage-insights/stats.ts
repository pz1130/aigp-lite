export interface StatsInput {
  toolName: string;
  outcome: string;
  actorId: string;
}

export interface UsageStats {
  total: number;
  byTool: Record<string, number>;
  byOutcome: Record<string, number>;
  distinctActors: number;
  clusteredCount: number;
  longTailCount: number;
}

export interface DeltaCell {
  prev: number;
  curr: number;
  delta: number;
  pct: number | null;
}

export interface UsageDeltas {
  baseline: boolean;
  byTool: Record<string, DeltaCell>;
  byOutcome: Record<string, DeltaCell>;
}

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

export function computeStats(
  rows: StatsInput[],
  clustering: { clusteredCount: number; longTailCount: number },
): UsageStats {
  const byTool: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const actors = new Set<string>();
  for (const r of rows) {
    if (r.toolName) bump(byTool, r.toolName);
    if (r.outcome) bump(byOutcome, r.outcome);
    if (r.actorId) actors.add(r.actorId);
  }
  return {
    total: rows.length,
    byTool,
    byOutcome,
    distinctActors: actors.size,
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
  curr: UsageStats,
  prior: UsageStats | null,
): UsageDeltas {
  const baseline = prior === null;
  const prev = prior ?? { byTool: {}, byOutcome: {} };
  return {
    baseline,
    byTool: deltaMap(curr.byTool, prev.byTool, baseline),
    byOutcome: deltaMap(curr.byOutcome, prev.byOutcome, baseline),
  };
}
