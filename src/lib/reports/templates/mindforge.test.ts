import { describe, it, expect } from "vitest";
import { mindforgeTemplate } from "./mindforge";

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
  "mindforge_consideration",
  "fairness_assessment",
  "vendor_due_diligence",
]);

const SPECIAL_DATA_SOURCES: Record<string, string> = {
  C7: "fairness_assessment",
  C13: "vendor_due_diligence",
};

describe("mindforgeTemplate", () => {
  it("has id mindforge", () => {
    expect(mindforgeTemplate.id).toBe("mindforge");
  });

  it("has exactly 17 Consideration controls", () => {
    expect(mindforgeTemplate.controls).toHaveLength(17);
  });

  it("control ids are unique and are C1..C17", () => {
    const ids = mindforgeTemplate.controls.map((c) => c.id).sort();
    expect(new Set(ids).size).toBe(17);
    expect(ids).toEqual(
      Array.from({ length: 17 }, (_, i) => `C${i + 1}`).sort(),
    );
  });

  it("every control uses a valid dataSource with appropriate query", () => {
    for (const c of mindforgeTemplate.controls) {
      expect(VALID_DATA_SOURCES.has(c.dataSource)).toBe(true);
      if (SPECIAL_DATA_SOURCES[c.id]) {
        expect(c.dataSource).toBe(SPECIAL_DATA_SOURCES[c.id]);
      } else {
        expect(c.dataSource).toBe("mindforge_consideration");
        expect(c.query?.considerationCode).toBe(c.id);
      }
      expect(c.description.length).toBeGreaterThan(20);
    }
  });
});
