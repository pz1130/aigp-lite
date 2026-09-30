import { describe, it, expect } from "vitest";
import { hasPermission } from "@/lib/rbac/check";

describe("go-live permissions", () => {
  it("admin, risk_officer, ai_owner can approve go-live", () => {
    expect(hasPermission("admin", "go-live.approve")).toBe(true);
    expect(hasPermission("risk_officer", "go-live.approve")).toBe(true);
    expect(hasPermission("ai_owner", "go-live.approve")).toBe(true);
  });
  it("auditor and viewer can read but not approve go-live", () => {
    expect(hasPermission("auditor", "go-live.read")).toBe(true);
    expect(hasPermission("auditor", "go-live.approve")).toBe(false);
    expect(hasPermission("viewer", "go-live.read")).toBe(true);
    expect(hasPermission("viewer", "go-live.approve")).toBe(false);
  });
});
