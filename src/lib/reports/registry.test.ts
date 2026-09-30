import { describe, it, expect } from "vitest";
import { listTemplates, getTemplate } from "./registry";
import type { ReportTemplateId } from "./types";

describe("template registry", () => {
  it("listTemplates returns 6 entries", () => {
    expect(listTemplates().length).toBe(6);
  });
  it("all 6 ids are registered", () => {
    const ids = listTemplates()
      .map((t) => t.id)
      .sort();
    expect(ids).toEqual([
      "eu-ai-act",
      "iso-27001",
      "iso-42001",
      "mindforge",
      "nist-ai-rmf",
      "soc2-type2",
    ]);
  });
  it("getTemplate returns correct template", () => {
    const t = getTemplate("nist-ai-rmf");
    expect(t.id).toBe("nist-ai-rmf");
    expect(t.version).toBeTruthy();
    expect(t.controls.length).toBeGreaterThan(0);
  });
  it("getTemplate throws for unknown id", () => {
    expect(() => getTemplate("unknown" as ReportTemplateId)).toThrow(
      /unknown template/,
    );
  });
});
