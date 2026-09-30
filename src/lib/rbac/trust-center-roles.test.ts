import { describe, it, expect } from "vitest";
import { hasPermission } from "./check";

describe("trust-center permissions", () => {
  it("admin holds all four actions", () => {
    for (const action of ["read", "write", "delete", "approve"] as const) {
      expect(hasPermission("admin", `trust-center.${action}`)).toBe(true);
    }
  });

  it("risk_officer may publish but ai_owner may not", () => {
    expect(hasPermission("risk_officer", "trust-center.approve")).toBe(true);
    expect(hasPermission("ai_owner", "trust-center.approve")).toBe(false);
    expect(hasPermission("ai_owner", "trust-center.write")).toBe(true);
  });

  it("auditor and viewer are read-only", () => {
    for (const role of ["auditor", "viewer"] as const) {
      expect(hasPermission(role, "trust-center.read")).toBe(true);
      expect(hasPermission(role, "trust-center.write")).toBe(false);
      expect(hasPermission(role, "trust-center.approve")).toBe(false);
    }
  });
});
