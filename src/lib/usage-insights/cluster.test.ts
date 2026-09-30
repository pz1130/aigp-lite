import { describe, it, expect } from "vitest";
import { groupByToolName, clusterByEmbedding } from "./cluster";

describe("groupByToolName", () => {
  it("groups by tool and suppresses below minClusterSize into long-tail", () => {
    const items = [
      { id: "1", toolName: "search" },
      { id: "2", toolName: "search" },
      { id: "3", toolName: "email" },
    ];
    const clusters = groupByToolName(items, { minClusterSize: 2 });
    const narrated = clusters.filter((c) => !c.isLongTail);
    const tail = clusters.find((c) => c.isLongTail);
    expect(narrated).toHaveLength(1);
    expect(narrated[0].memberIds.sort()).toEqual(["1", "2"]);
    expect(tail?.memberIds).toEqual(["3"]);
  });
});

describe("re-exported clusterByEmbedding", () => {
  it("is available", () => {
    expect(typeof clusterByEmbedding).toBe("function");
  });
});
