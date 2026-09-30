import { describe, it, expect } from "vitest";
import { DUE_DILIGENCE_CATALOG, DOMAINS, applicableItems } from "./catalog";

describe("vendor catalog", () => {
  it("has unique item codes", () => {
    const codes = DUE_DILIGENCE_CATALOG.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every item references a known domain", () => {
    const domainCodes = new Set(DOMAINS.map((d) => d.code));
    for (const item of DUE_DILIGENCE_CATALOG) {
      expect(domainCodes.has(item.domain)).toBe(true);
    }
  });

  it("flags the security-cert and liability items as critical", () => {
    const sec1 = DUE_DILIGENCE_CATALOG.find((i) => i.code === "SEC-1")!;
    const leg1 = DUE_DILIGENCE_CATALOG.find((i) => i.code === "LEG-1")!;
    expect(sec1.severity).toBe("critical");
    expect(leg1.severity).toBe("critical");
  });

  it("model-transparency items apply only to model providers", () => {
    const mod = DUE_DILIGENCE_CATALOG.filter((i) => i.domain === "MOD");
    expect(mod.length).toBeGreaterThan(0);
    for (const i of mod) expect(i.appliesTo).toEqual(["model_provider"]);
  });

  it("applicableItems filters by vendor type and drops not_applicable answers", () => {
    const all = applicableItems("data_vendor", []);
    expect(all.every((i) => i.appliesTo.includes("data_vendor"))).toBe(true);
    expect(all.some((i) => i.domain === "MOD")).toBe(false); // MOD is model_provider only

    const minusNa = applicableItems("data_vendor", [
      { itemCode: "DP-1", status: "not_applicable" },
    ]);
    expect(minusNa.some((i) => i.code === "DP-1")).toBe(false);
  });
});
