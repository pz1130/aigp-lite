import { describe, it, expect } from "vitest";
import { iso42001Template } from "./iso-42001";

describe("iso-42001 template", () => {
  it("has exactly 38 controls", () => {
    expect(iso42001Template.controls.length).toBe(38);
  });
  it("covers all 9 categories", () => {
    const cats = new Set(iso42001Template.controls.map((c) => c.category));
    expect(cats.has("A.2")).toBe(true);
    expect(cats.has("A.3")).toBe(true);
    expect(cats.has("A.4")).toBe(true);
    expect(cats.has("A.5")).toBe(true);
    expect(cats.has("A.6")).toBe(true);
    expect(cats.has("A.7")).toBe(true);
    expect(cats.has("A.8")).toBe(true);
    expect(cats.has("A.9")).toBe(true);
    expect(cats.has("A.10")).toBe(true);
  });
  it("control ids are unique", () => {
    const ids = iso42001Template.controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
