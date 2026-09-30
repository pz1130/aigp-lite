import { describe, it, expect } from "vitest";
import { nistAiRmfTemplate } from "./nist-ai-rmf";

describe("nist-ai-rmf template", () => {
  it("has at least 30 controls", () => {
    expect(nistAiRmfTemplate.controls.length).toBeGreaterThanOrEqual(30);
  });
  it("covers all 4 functions", () => {
    const cats = new Set(nistAiRmfTemplate.controls.map((c) => c.category));
    expect(cats.has("GOVERN")).toBe(true);
    expect(cats.has("MAP")).toBe(true);
    expect(cats.has("MEASURE")).toBe(true);
    expect(cats.has("MANAGE")).toBe(true);
  });
  it("control ids are unique", () => {
    const ids = nistAiRmfTemplate.controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
