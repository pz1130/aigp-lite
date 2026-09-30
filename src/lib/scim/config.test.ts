import { describe, it, expect } from "vitest";
import { resolveRoleFromScimAttribute } from "./config";

describe("resolveRoleFromScimAttribute", () => {
  it("returns viewer when roleAttribute is not configured", () => {
    expect(
      resolveRoleFromScimAttribute({ department: "eng" }, null, {
        eng: "admin",
      }),
    ).toBe("viewer");
  });

  it("returns viewer when roleValueMap is not configured", () => {
    expect(
      resolveRoleFromScimAttribute({ department: "eng" }, "department", null),
    ).toBe("viewer");
  });

  it("resolves a matching top-level attribute to its mapped role", () => {
    const role = resolveRoleFromScimAttribute(
      { department: "risk" },
      "department",
      {
        risk: "risk_officer",
        eng: "admin",
      },
    );
    expect(role).toBe("risk_officer");
  });

  it("resolves a nested dot-path attribute", () => {
    const role = resolveRoleFromScimAttribute(
      { "urn:custom": { department: "eng" } },
      "urn:custom.department",
      { eng: "admin" },
    );
    expect(role).toBe("admin");
  });

  it("falls back to viewer when the attribute value has no mapping entry", () => {
    expect(
      resolveRoleFromScimAttribute({ department: "sales" }, "department", {
        eng: "admin",
      }),
    ).toBe("viewer");
  });

  it("falls back to viewer when the mapped value is not a valid role", () => {
    expect(
      resolveRoleFromScimAttribute({ department: "eng" }, "department", {
        eng: "superuser",
      }),
    ).toBe("viewer");
  });

  it("resolves from an array-valued attribute", () => {
    const role = resolveRoleFromScimAttribute(
      { groups: ["staff", "platform-admins"] },
      "groups",
      { "platform-admins": "admin" },
    );
    expect(role).toBe("admin");
  });
});
