import { describe, it, expect } from "vitest";
import {
  getCatalogWithCrossLinks,
  resolveCrossLinks,
  flattenItems,
} from "./catalog";

function mockClient(opts: {
  sections: {
    id: string;
    num: number;
    key: string;
    asiCode: string;
    title: string;
    order: number;
    items: { code: string }[];
  }[];
  riskRows: {
    code: string;
    title: string;
    frameworkRefs: unknown;
    relatedRiskCodes: string[];
  }[];
}) {
  return {
    asiChkSection: {
      findMany: async () => opts.sections,
    },
    riskCatalog: {
      findMany: async () => opts.riskRows,
    },
  } as never;
}

describe("resolveCrossLinks", () => {
  it("maps frameworkRefs + relatedRiskCodes by code", async () => {
    const client = mockClient({
      sections: [],
      riskRows: [
        {
          code: "asi-01",
          title: "Agent Goal Hijack",
          frameworkRefs: {
            owaspLlmTop10: ["LLM01"],
            agenticThreats: ["T6", "T7"],
            aivss: ["x"],
          },
          relatedRiskCodes: ["atlas-1"],
        },
      ],
    });
    const map = await resolveCrossLinks(["asi-01"], client);
    expect(map.get("asi-01")).toEqual({
      title: "Agent Goal Hijack",
      atlas: ["atlas-1"],
      llmTop10: ["LLM01"],
      agenticThreats: ["T6", "T7"],
      aivss: ["x"],
    });
  });

  it("returns an empty map for no codes without hitting the client", async () => {
    const map = await resolveCrossLinks(
      [],
      mockClient({ sections: [], riskRows: [] }),
    );
    expect(map.size).toBe(0);
  });
});

describe("getCatalogWithCrossLinks", () => {
  it("attaches cross-links per section and degrades to empty when a row is missing", async () => {
    const client = mockClient({
      sections: [
        {
          id: "s1",
          num: 1,
          key: "asi-01-goal-hijack",
          asiCode: "asi-01",
          title: "Agent Goal Hijack",
          order: 1,
          items: [{ code: "ASI01-T1" }],
        },
        {
          id: "s2",
          num: 2,
          key: "asi-02-tool-misuse",
          asiCode: "asi-02",
          title: "Tool Misuse",
          order: 2,
          items: [{ code: "ASI02-T1" }],
        },
      ],
      riskRows: [
        {
          code: "asi-01",
          title: "Agent Goal Hijack",
          frameworkRefs: { owaspLlmTop10: ["LLM01"] },
          relatedRiskCodes: [],
        },
      ],
    });
    const catalog = await getCatalogWithCrossLinks(client);
    expect(catalog[0].crossLinks.llmTop10).toEqual(["LLM01"]);
    expect(catalog[1].crossLinks).toEqual({
      title: null,
      atlas: [],
      llmTop10: [],
      agenticThreats: [],
      aivss: [],
    });
    expect(flattenItems(catalog).map((i) => i.code)).toEqual([
      "ASI01-T1",
      "ASI02-T1",
    ]);
  });
});
