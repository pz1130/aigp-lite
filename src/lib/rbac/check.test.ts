import { describe, it, expect } from "vitest";
import { assertPermission, hasPermission } from "./check";
import { ForbiddenError } from "@/lib/errors";

describe("rbac", () => {
  it("admin has every permission", () => {
    expect(hasPermission("admin", "audit.read")).toBe(true);
    expect(hasPermission("admin", "inventory.write")).toBe(true);
  });

  it("viewer can only read", () => {
    expect(hasPermission("viewer", "inventory.read")).toBe(true);
    expect(hasPermission("viewer", "inventory.write")).toBe(false);
  });

  it("auditor can read everything but not write", () => {
    expect(hasPermission("auditor", "audit.read")).toBe(true);
    expect(hasPermission("auditor", "policy.read")).toBe(true);
    expect(hasPermission("auditor", "policy.write")).toBe(false);
  });

  it("ai_owner can write inventory, evidence, and policy", () => {
    expect(hasPermission("ai_owner", "inventory.write")).toBe(true);
    expect(hasPermission("ai_owner", "evidence.write")).toBe(true);
    expect(hasPermission("ai_owner", "policy.write")).toBe(true);
  });

  it("risk_officer can write risk and policy", () => {
    expect(hasPermission("risk_officer", "risk.write")).toBe(true);
    expect(hasPermission("risk_officer", "policy.write")).toBe(true);
  });

  it("assertPermission throws ForbiddenError when denied", () => {
    expect(() => assertPermission("viewer", "inventory.write")).toThrow(
      ForbiddenError,
    );
    expect(() => assertPermission("admin", "inventory.write")).not.toThrow();
  });

  it("maturity: risk_officer can write, others read-only", () => {
    expect(hasPermission("risk_officer", "maturity.write")).toBe(true);
    expect(hasPermission("ai_owner", "maturity.read")).toBe(true);
    expect(hasPermission("ai_owner", "maturity.write")).toBe(false);
    expect(hasPermission("auditor", "maturity.read")).toBe(true);
    expect(hasPermission("auditor", "maturity.write")).toBe(false);
    expect(hasPermission("viewer", "maturity.read")).toBe(true);
    expect(hasPermission("viewer", "maturity.write")).toBe(false);
  });

  it("admin has provider.write", () => {
    expect(hasPermission("admin", "provider.write")).toBe(true);
  });

  it("admin has provider.delete", () => {
    expect(hasPermission("admin", "provider.delete")).toBe(true);
  });

  it("viewer cannot write provider", () => {
    expect(hasPermission("viewer", "provider.write")).toBe(false);
  });

  it("auditor can read provider but not write", () => {
    expect(hasPermission("auditor", "provider.read")).toBe(true);
    expect(hasPermission("auditor", "provider.write")).toBe(false);
  });

  it("admin has reports.delete", () => {
    expect(hasPermission("admin", "reports.delete")).toBe(true);
  });
  it("viewer can read reports", () => {
    expect(hasPermission("viewer", "reports.read")).toBe(true);
  });
  it("viewer cannot write reports", () => {
    expect(hasPermission("viewer", "reports.write")).toBe(false);
  });
  it("auditor can generate reports", () => {
    expect(hasPermission("auditor", "reports.write")).toBe(true);
  });
  it("risk_officer has full reports access", () => {
    expect(hasPermission("risk_officer", "reports.delete")).toBe(true);
  });

  it("admin has finops.delete", () => {
    expect(hasPermission("admin", "finops.delete")).toBe(true);
  });
  it("viewer can read finops", () => {
    expect(hasPermission("viewer", "finops.read")).toBe(true);
  });
  it("viewer cannot write finops", () => {
    expect(hasPermission("viewer", "finops.write")).toBe(false);
  });

  it("admin has integrations.delete", () => {
    expect(hasPermission("admin", "integrations.delete")).toBe(true);
  });
  it("ai_owner can write integrations", () => {
    expect(hasPermission("ai_owner", "integrations.write")).toBe(true);
  });
  it("ai_owner cannot delete integrations", () => {
    expect(hasPermission("ai_owner", "integrations.delete")).toBe(false);
  });
  it("viewer cannot write integrations", () => {
    expect(hasPermission("viewer", "integrations.write")).toBe(false);
  });
  it("risk_officer cannot write integrations", () => {
    expect(hasPermission("risk_officer", "integrations.write")).toBe(false);
  });

  it("admin has redteam.delete", () => {
    expect(hasPermission("admin", "redteam.delete")).toBe(true);
  });
  it("risk_officer can write redteam", () => {
    expect(hasPermission("risk_officer", "redteam.write")).toBe(true);
  });
  it("ai_owner can write redteam", () => {
    expect(hasPermission("ai_owner", "redteam.write")).toBe(true);
  });
  it("auditor can read redteam but not write", () => {
    expect(hasPermission("auditor", "redteam.read")).toBe(true);
    expect(hasPermission("auditor", "redteam.write")).toBe(false);
  });
  it("viewer cannot write redteam", () => {
    expect(hasPermission("viewer", "redteam.write")).toBe(false);
  });

  describe("fria permissions", () => {
    it("admin can approve", () => {
      expect(hasPermission("admin", "fria.approve")).toBe(true);
    });
    it("risk_officer can approve", () => {
      expect(hasPermission("risk_officer", "fria.approve")).toBe(true);
    });
    it("ai_owner cannot approve", () => {
      expect(hasPermission("ai_owner", "fria.approve")).toBe(false);
    });
    it("auditor cannot approve", () => {
      expect(hasPermission("auditor", "fria.approve")).toBe(false);
    });
    it("viewer can read", () => {
      expect(hasPermission("viewer", "fria.read")).toBe(true);
    });
    it("viewer cannot write", () => {
      expect(hasPermission("viewer", "fria.write")).toBe(false);
    });
  });

  it("aivtf permissions follow the fria model", () => {
    expect(hasPermission("admin", "aivtf.approve")).toBe(true);
    expect(hasPermission("risk_officer", "aivtf.approve")).toBe(true);
    expect(hasPermission("ai_owner", "aivtf.write")).toBe(true);
    expect(hasPermission("ai_owner", "aivtf.approve")).toBe(false);
    expect(hasPermission("viewer", "aivtf.read")).toBe(true);
    expect(hasPermission("viewer", "aivtf.write")).toBe(false);
  });
});
