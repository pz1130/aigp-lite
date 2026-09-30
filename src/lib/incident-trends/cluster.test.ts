import { describe, it, expect } from "vitest";
import {
  clusterByEmbedding,
  groupByCategorySeverity,
  type ClusterableIncident,
} from "./cluster";

// 2-d unit-ish vectors keep cosine intuitive.
const A = (id: string, v: number[]): ClusterableIncident => ({
  id,
  embedding: v,
});

describe("clusterByEmbedding", () => {
  it("groups near-parallel vectors and is order-deterministic", () => {
    const incidents = [
      A("a", [1, 0]),
      A("b", [0.99, 0.01]),
      A("c", [0, 1]),
      A("d", [0.02, 0.98]),
    ];
    const clusters = clusterByEmbedding(incidents, {
      threshold: 0.9,
      minClusterSize: 2,
    });
    // Two narrated clusters, no long tail.
    expect(clusters).toHaveLength(2);
    expect(clusters[0].memberIds.sort()).toEqual(["a", "b"]);
    expect(clusters[1].memberIds.sort()).toEqual(["c", "d"]);
    expect(clusters.every((c) => !c.isLongTail)).toBe(true);
  });

  it("routes singletons into a single long-tail bucket", () => {
    const incidents = [
      A("a", [1, 0]),
      A("b", [0.99, 0.01]),
      A("c", [0, 1]), // alone
    ];
    const clusters = clusterByEmbedding(incidents, {
      threshold: 0.95,
      minClusterSize: 2,
    });
    expect(clusters).toHaveLength(2);
    expect(clusters[0].isLongTail).toBe(false);
    expect(clusters[0].memberIds.sort()).toEqual(["a", "b"]);
    const tail = clusters[1];
    expect(tail.isLongTail).toBe(true);
    expect(tail.memberIds).toEqual(["c"]);
  });

  it("returns an empty array for no incidents", () => {
    expect(
      clusterByEmbedding([], { threshold: 0.8, minClusterSize: 2 }),
    ).toEqual([]);
  });
});

describe("groupByCategorySeverity", () => {
  it("buckets by category+severity and long-tails singletons", () => {
    const clusters = groupByCategorySeverity(
      [
        { id: "a", category: "data_leak", severity: "high" },
        { id: "b", category: "data_leak", severity: "high" },
        { id: "c", category: "bias_harm", severity: "low" }, // alone
      ],
      { minClusterSize: 2 },
    );
    expect(clusters[0].memberIds.sort()).toEqual(["a", "b"]);
    expect(clusters[clusters.length - 1].isLongTail).toBe(true);
    expect(clusters[clusters.length - 1].memberIds).toEqual(["c"]);
  });
});
