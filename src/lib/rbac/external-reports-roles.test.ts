import { describe, it, expect } from "vitest";
import { MATRIX } from "./roles";

describe("external-reports RBAC", () => {
  it("admin has read/write/delete", () => {
    expect(MATRIX.admin.has("external-reports.read")).toBe(true);
    expect(MATRIX.admin.has("external-reports.write")).toBe(true);
    expect(MATRIX.admin.has("external-reports.delete")).toBe(true);
  });

  it("risk_officer and ai_owner can triage (write) but not manage (delete)", () => {
    for (const role of ["risk_officer", "ai_owner"] as const) {
      expect(MATRIX[role].has("external-reports.read")).toBe(true);
      expect(MATRIX[role].has("external-reports.write")).toBe(true);
      expect(MATRIX[role].has("external-reports.delete")).toBe(false);
    }
  });

  it("auditor and viewer are read-only", () => {
    for (const role of ["auditor", "viewer"] as const) {
      expect(MATRIX[role].has("external-reports.read")).toBe(true);
      expect(MATRIX[role].has("external-reports.write")).toBe(false);
    }
  });
});
