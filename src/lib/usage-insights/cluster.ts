export {
  clusterByEmbedding,
  type RawCluster,
  type ClusterableIncident as ClusterableItem,
} from "@/lib/incident-trends/cluster";
import type { RawCluster } from "@/lib/incident-trends/cluster";

/** Fallback grouping when no embeddings are available: bucket by tool name. */
export function groupByToolName(
  items: { id: string; toolName: string }[],
  opts: { minClusterSize: number },
): RawCluster[] {
  const order: string[] = [];
  const byKey = new Map<string, string[]>();
  for (const it of items) {
    const key = it.toolName || "unknown";
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(it.id);
  }
  const narrated: RawCluster[] = [];
  const tail: string[] = [];
  for (const key of order) {
    const ids = byKey.get(key)!;
    if (ids.length >= opts.minClusterSize) {
      narrated.push({ memberIds: ids, isLongTail: false });
    } else {
      tail.push(...ids);
    }
  }
  if (tail.length > 0) narrated.push({ memberIds: tail, isLongTail: true });
  return narrated;
}
