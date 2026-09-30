import { cosineSimilarity } from "@/lib/incidents/cosine";

export interface RawCluster {
  memberIds: string[];
  isLongTail: boolean;
}

export interface ClusterableIncident {
  id: string;
  embedding: number[];
}

export interface FallbackIncident {
  id: string;
  category: string | null;
  severity: string;
}

/** Split raw buckets into narrated clusters + one long-tail bucket. */
function finalize(
  buckets: { memberIds: string[] }[],
  minClusterSize: number,
): RawCluster[] {
  const narrated: RawCluster[] = [];
  const tail: string[] = [];
  for (const b of buckets) {
    if (b.memberIds.length >= minClusterSize) {
      narrated.push({ memberIds: b.memberIds, isLongTail: false });
    } else {
      tail.push(...b.memberIds);
    }
  }
  if (tail.length > 0) narrated.push({ memberIds: tail, isLongTail: true });
  return narrated;
}

export function clusterByEmbedding(
  incidents: ClusterableIncident[],
  opts: { threshold: number; minClusterSize: number },
): RawCluster[] {
  const centroids: number[][] = [];
  const buckets: { memberIds: string[] }[] = [];

  for (const inc of incidents) {
    let bestIdx = -1;
    let bestSim = opts.threshold;
    for (let i = 0; i < centroids.length; i++) {
      const sim = cosineSimilarity(inc.embedding, centroids[i]);
      if (sim >= bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      centroids.push([...inc.embedding]);
      buckets.push({ memberIds: [inc.id] });
    } else {
      const bucket = buckets[bestIdx];
      const n = bucket.memberIds.length;
      const c = centroids[bestIdx];
      for (let d = 0; d < c.length; d++) {
        c[d] = (c[d] * n + inc.embedding[d]) / (n + 1);
      }
      bucket.memberIds.push(inc.id);
    }
  }

  return finalize(buckets, opts.minClusterSize);
}

export function groupByCategorySeverity(
  incidents: FallbackIncident[],
  opts: { minClusterSize: number },
): RawCluster[] {
  const order: string[] = [];
  const byKey = new Map<string, string[]>();
  for (const inc of incidents) {
    const key = `${inc.category ?? "uncategorized"}|${inc.severity}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(inc.id);
  }
  const buckets = order.map((k) => ({ memberIds: byKey.get(k)! }));
  return finalize(buckets, opts.minClusterSize);
}
