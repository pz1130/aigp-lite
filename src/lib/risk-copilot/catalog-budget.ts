/** Rough token estimate: ~4 chars per token over the JSON serialization. */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

export interface DroppedSource {
  source: string;
  count: number;
}

export interface CatalogSelection<T> {
  kept: T[];
  dropped: DroppedSource[];
}

/**
 * Select catalog rows to fit `budget` estimated tokens.
 *
 * If the full list fits, returns all rows (dropped: []). Otherwise selects
 * fairly: group by source (first-seen order), then take rows round-robin across
 * sources until adding the next row would exceed the budget. Guarantees every
 * source is represented before any source receives a disproportionate share —
 * no source is wholly dropped while another keeps multiples. `entries` is
 * expected pre-sorted (source asc, code asc); within-source order is preserved
 * and `kept` is re-grouped by source so the prompt stays grouped.
 */
export function selectCatalogWithinBudget<T extends { source: string }>(
  entries: T[],
  budget: number,
): CatalogSelection<T> {
  if (estimateTokens(entries) <= budget) {
    return { kept: entries, dropped: [] };
  }

  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    let g = groups.get(e.source);
    if (!g) {
      g = [];
      groups.set(e.source, g);
      order.push(e.source);
    }
    g.push(e);
  }

  const kept: T[] = [];
  const keptCount = new Map<string, number>();
  const stopped = new Set<string>();
  const maxLen = Math.max(...order.map((s) => groups.get(s)!.length));

  for (let i = 0; i < maxLen && stopped.size < order.length; i++) {
    for (const source of order) {
      if (stopped.has(source)) continue;
      const g = groups.get(source)!;
      if (i >= g.length) continue;
      const candidate = g[i];
      if (estimateTokens([...kept, candidate]) <= budget) {
        kept.push(candidate);
        keptCount.set(source, (keptCount.get(source) ?? 0) + 1);
      } else {
        stopped.add(source);
      }
    }
  }

  // Re-group kept by source (first-seen order) so the prompt stays grouped.
  const regrouped: T[] = [];
  for (const source of order) {
    for (const e of kept) {
      if (e.source === source) regrouped.push(e);
    }
  }

  const dropped: DroppedSource[] = [];
  for (const source of order) {
    const orig = groups.get(source)!.length;
    const k = keptCount.get(source) ?? 0;
    if (orig - k > 0) dropped.push({ source, count: orig - k });
  }
  dropped.sort((a, b) => a.source.localeCompare(b.source));

  return { kept: regrouped, dropped };
}
