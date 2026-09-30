import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { provisionScimUser, deprovisionScimUser } from "./provision";
import * as audit from "@/lib/audit/log";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "SCIM-PROV-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

describe("provisionScimUser", () => {
  it("creates a brand-new user with no password/oidcSubject and a viewer membership by default", async () => {
    const org = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `new-${Date.now()}@example.com`;

    const r = await provisionScimUser(
      { email, name: "Alice", active: true, raw: { email } },
      { orgId: org.id, roleAttribute: null, roleValueMap: null },
    );

    expect(r.firstTime).toBe(true);
    const user = await prisma.user.findUnique({ where: { id: r.userId } });
    expect(user!.passwordHash).toBeNull();
    expect(user!.oidcSubject).toBeNull();
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: r.userId } },
    });
    expect(m!.role).toBe("viewer");
  });

  it("attaches a membership to an existing user found by email, without touching their password", async () => {
    const org = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `existing-${Date.now()}@example.com`;
    const existing = await prisma.user.create({
      data: { email, name: "Bob", passwordHash: "hash-existing" },
    });

    const r = await provisionScimUser(
      { email, name: "Bob", active: true, raw: { email } },
      { orgId: org.id, roleAttribute: null, roleValueMap: null },
    );

    expect(r.firstTime).toBe(false);
    expect(r.userId).toBe(existing.id);
    const updated = await prisma.user.findUnique({
      where: { id: existing.id },
    });
    expect(updated!.passwordHash).toBe("hash-existing");
  });

  it("resolves the role from the connection's roleAttribute/roleValueMap", async () => {
    const org = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `admin-${Date.now()}@example.com`;

    const r = await provisionScimUser(
      { email, name: "Admin", active: true, raw: { email, department: "eng" } },
      {
        orgId: org.id,
        roleAttribute: "department",
        roleValueMap: { eng: "admin" },
      },
    );

    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: r.userId } },
    });
    expect(m!.role).toBe("admin");
  });

  it("is idempotent: re-provisioning the same user updates role instead of duplicating membership", async () => {
    const org = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `repeat-${Date.now()}@example.com`;

    await provisionScimUser(
      { email, name: "R", active: true, raw: { email, department: "eng" } },
      {
        orgId: org.id,
        roleAttribute: "department",
        roleValueMap: { eng: "admin" },
      },
    );
    const before = await prisma.membership.count({ where: { orgId: org.id } });

    const r2 = await provisionScimUser(
      { email, name: "R", active: true, raw: { email, department: "risk" } },
      {
        orgId: org.id,
        roleAttribute: "department",
        roleValueMap: { eng: "admin", risk: "risk_officer" },
      },
    );
    const after = await prisma.membership.count({ where: { orgId: org.id } });

    expect(after).toBe(before);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: r2.userId } },
    });
    expect(m!.role).toBe("risk_officer");
  });
});

describe("deprovisionScimUser", () => {
  it("removes only the Membership row, leaving the User row intact", async () => {
    const org = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `deprov-${Date.now()}@example.com`;
    const r = await provisionScimUser(
      { email, name: "D", active: true, raw: { email } },
      { orgId: org.id, roleAttribute: null, roleValueMap: null },
    );

    await deprovisionScimUser(r.userId, org.id);

    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: r.userId } },
    });
    expect(m).toBeNull();
    const user = await prisma.user.findUnique({ where: { id: r.userId } });
    expect(user).not.toBeNull();
  });

  it("is idempotent: deprovisioning a user with no membership is a no-op", async () => {
    const org = await makeOrg();
    const user = await prisma.user.create({
      data: { email: `nomember-${Date.now()}@example.com`, passwordHash: "x" },
    });
    await expect(deprovisionScimUser(user.id, org.id)).resolves.toBeUndefined();
  });
});
