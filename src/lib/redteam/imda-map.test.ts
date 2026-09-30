import { describe, it, expect } from "vitest";
import { IMDA_DIMENSION_BY_CATEGORY, imdaCoverage } from "./imda-map";
import { CATEGORIES } from "./types";

describe("IMDA mapping", () => {
  it("maps every red-team category to an IMDA dimension", () => {
    for (const c of CATEGORIES) {
      expect(IMDA_DIMENSION_BY_CATEGORY[c]).toBeTruthy();
    }
  });

  it("imdaCoverage returns the distinct dimensions exercised by a set of categories", () => {
    const cov = imdaCoverage(["jailbreak", "toxicity", "harmful"]);
    expect(cov).toContain("Safety");
    expect(cov).toContain("Toxicity");
    expect(new Set(cov).size).toBe(cov.length);
  });
});
