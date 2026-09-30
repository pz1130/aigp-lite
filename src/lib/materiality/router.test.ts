import { describe, it, expect } from "vitest";
import { MATRIX } from "@/lib/rbac/roles";

describe("materiality RBAC grants", () => {
  it("ai_owner and risk_officer can write; viewer/auditor read-only", () => {
    expect(MATRIX.admin.has("materiality.write")).toBe(true);
    expect(MATRIX.ai_owner.has("materiality.write")).toBe(true);
    expect(MATRIX.risk_officer.has("materiality.write")).toBe(true);
    expect(MATRIX.viewer.has("materiality.read")).toBe(true);
    expect(MATRIX.viewer.has("materiality.write")).toBe(false);
    expect(MATRIX.auditor.has("materiality.read")).toBe(true);
    expect(MATRIX.auditor.has("materiality.write")).toBe(false);
  });
});

describe("materiality router shape", () => {
  it("exposes get/upsert/setOverride/clearOverride procedures", async () => {
    const { materialityRouter } = await import("./router");
    const defs = materialityRouter._def.procedures;
    expect(Object.keys(defs).sort()).toEqual(
      ["clearOverride", "get", "setOverride", "upsert"].sort(),
    );
  });
});
