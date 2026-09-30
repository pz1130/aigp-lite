import { describe, it, expect } from "vitest";
import {
  flattenThresholds,
  countThresholds,
  type CategoryWithThresholds,
} from "./catalog";

const fake = (code: string, n: number): CategoryWithThresholds =>
  ({
    id: code,
    code,
    order: 1,
    title: code,
    summary: "",
    thresholds: Array.from({ length: n }, (_, i) => ({
      id: `${code}-${i}`,
      categoryId: code,
      code: `FRT-${code}-T1-${i + 1}`,
      tier: 1,
      order: i + 1,
      statement: "s",
      guidance: null,
    })),
  }) as unknown as CategoryWithThresholds;

describe("catalog helpers", () => {
  it("flattens thresholds across categories", () => {
    const cat = [fake("CYBER", 2), fake("CBRN", 3)];
    expect(flattenThresholds(cat)).toHaveLength(5);
  });

  it("counts thresholds", () => {
    expect(countThresholds([fake("CYBER", 9)])).toBe(9);
  });
});
