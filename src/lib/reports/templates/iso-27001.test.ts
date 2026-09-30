import { describe, it, expect } from "vitest";
import { iso27001Template } from "./iso-27001";

describe("iso-27001 template", () => {
  it("has at least 40 controls", () => {
    expect(iso27001Template.controls.length).toBeGreaterThanOrEqual(40);
  });
  it("covers A.5, A.6, A.8 categories", () => {
    const cats = new Set(iso27001Template.controls.map((c) => c.category));
    expect(cats.has("A.5")).toBe(true);
    expect(cats.has("A.6")).toBe(true);
    expect(cats.has("A.8")).toBe(true);
  });
  it("control ids are unique", () => {
    const ids = iso27001Template.controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
