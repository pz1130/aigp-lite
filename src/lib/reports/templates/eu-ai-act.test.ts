import { describe, it, expect } from "vitest";
import { euAiActTemplate } from "./eu-ai-act";

const VALID_DATA_SOURCES = new Set([
  "inventory",
  "risk",
  "audit",
  "incident",
  "maturity",
  "policy",
  "workflow",
  "evidence",
  "data_lineage",
  "narrative",
  "fria",
  "eu_obligation",
]);

describe("euAiActTemplate", () => {
  it("has id eu-ai-act", () => {
    expect(euAiActTemplate.id).toBe("eu-ai-act");
  });

  it("has exactly 12 controls", () => {
    expect(euAiActTemplate.controls).toHaveLength(12);
  });

  it("control ids are unique", () => {
    const ids = euAiActTemplate.controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every control has a non-empty description and a valid dataSource", () => {
    for (const c of euAiActTemplate.controls) {
      expect(c.description.length).toBeGreaterThan(40);
      expect(VALID_DATA_SOURCES.has(c.dataSource)).toBe(true);
    }
  });

  it("covers articles 4, 6, 9, 10, 11, 12, 13, 14, 15, 26, 27, 50", () => {
    const ids = euAiActTemplate.controls.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        "Art.10",
        "Art.11",
        "Art.12",
        "Art.13",
        "Art.14",
        "Art.15",
        "Art.26",
        "Art.27",
        "Art.4",
        "Art.50",
        "Art.6",
        "Art.9",
      ].sort(),
    );
  });

  it("the 9 mapped articles use eu_obligation with a matching obligationCode", () => {
    const expected: Record<string, string> = {
      "Art.9": "ART-9",
      "Art.10": "ART-10",
      "Art.11": "ART-11",
      "Art.12": "ART-12",
      "Art.13": "ART-13",
      "Art.14": "ART-14",
      "Art.15": "ART-15",
      "Art.27": "ART-27",
      "Art.50": "ART-50",
    };
    for (const [id, code] of Object.entries(expected)) {
      const c = euAiActTemplate.controls.find((x) => x.id === id);
      expect(c?.dataSource).toBe("eu_obligation");
      expect(c?.query?.obligationCode).toBe(code);
    }
  });

  it("the 3 unmapped articles keep their original dataSource", () => {
    const get = (id: string) =>
      euAiActTemplate.controls.find((c) => c.id === id);
    expect(get("Art.4")?.dataSource).toBe("narrative");
    expect(get("Art.6")?.dataSource).toBe("narrative");
    expect(get("Art.26")?.dataSource).toBe("incident");
  });
});
