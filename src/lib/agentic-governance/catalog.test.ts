import { describe, it, expect } from "vitest";
import {
  getCatalogWithSeeAlso,
  parseSeeAlso,
  flattenItems,
  countItems,
} from "./catalog";

function mockClient(sections: unknown[]) {
  return {
    agChkSection: { findMany: async () => sections },
  } as never;
}

describe("parseSeeAlso", () => {
  it("returns typed entries and ignores malformed input", () => {
    expect(
      parseSeeAlso([{ slug: "mcp", labelEn: "MCP", labelZh: "MCP" }]),
    ).toEqual([{ slug: "mcp", labelEn: "MCP", labelZh: "MCP" }]);
    expect(parseSeeAlso(null)).toEqual([]);
    expect(parseSeeAlso("nope")).toEqual([]);
    expect(parseSeeAlso([{ slug: "x" }])).toEqual([]);
  });
});

describe("getCatalogWithSeeAlso", () => {
  it("parses each section's seeAlso json and preserves item order", async () => {
    const client = mockClient([
      {
        id: "s1",
        num: 1,
        key: "ag1-tool-access",
        title: "Tool & connection access",
        intent: "x",
        order: 1,
        seeAlso: [
          {
            slug: "mcp",
            labelEn: "MCP Trust Governance",
            labelZh: "MCP 信任治理",
          },
        ],
        items: [{ code: "AG1-01" }, { code: "AG1-02" }],
      },
      {
        id: "s2",
        num: 2,
        key: "ag2-traceability",
        title: "Action logging & traceability",
        intent: "y",
        order: 2,
        seeAlso: [],
        items: [{ code: "AG2-01" }],
      },
    ]);
    const catalog = await getCatalogWithSeeAlso(client);
    expect(catalog[0].seeAlso[0].slug).toBe("mcp");
    expect(catalog[1].seeAlso).toEqual([]);
    expect(flattenItems(catalog).map((i) => i.code)).toEqual([
      "AG1-01",
      "AG1-02",
      "AG2-01",
    ]);
    expect(countItems(catalog)).toBe(3);
  });
});
