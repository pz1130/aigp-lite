import { describe, it, expect } from "vitest";
import { CATALOG, getCatalogEntry, validateCatalog } from "./catalog";
import { ProviderType } from "@/lib/prisma";

describe("catalog", () => {
  it("has 13 entries", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(13);
  });

  it("has unique slugs", () => {
    const slugs = CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("covers every ProviderType at least once", () => {
    const types = new Set(CATALOG.map((e) => e.providerType));
    for (const t of Object.values(ProviderType)) {
      expect(types.has(t as ProviderType)).toBe(true);
    }
  });

  it("getCatalogEntry returns entry by slug", () => {
    const e = getCatalogEntry("deepseek");
    expect(e?.providerType).toBe("openai_compatible");
    expect(e?.defaultBaseUrl).toContain("deepseek");
  });

  it("validateCatalog passes for current set", () => {
    expect(() => validateCatalog()).not.toThrow();
  });

  it("every non-custom entry has a defaultBaseUrl", () => {
    const customs = ["custom-openai", "custom-anthropic", "azure-openai"];
    for (const e of CATALOG) {
      if (!customs.includes(e.slug))
        expect(e.defaultBaseUrl, e.slug).toBeTruthy();
    }
  });
});
