import { describe, it, expect } from "vitest";
import { soc2Type2Template } from "./soc2-type2";

describe("soc2-type2 template", () => {
  it("has at least 30 controls", () => {
    expect(soc2Type2Template.controls.length).toBeGreaterThanOrEqual(30);
  });
  it("covers CC and A1 categories", () => {
    const cats = new Set(soc2Type2Template.controls.map((c) => c.category));
    expect(cats.has("CC1")).toBe(true);
    expect(cats.has("CC6")).toBe(true);
    expect(cats.has("CC7")).toBe(true);
  });
  it("control ids are unique", () => {
    const ids = soc2Type2Template.controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
