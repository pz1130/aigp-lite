import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { provisionScimUser, deprovisionScimUser } from "./provision";
import * as audit from "@/lib/audit/log";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "SCIM-ISO-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

describe("provisionScimUser / deprovisionScimUser: org isolation", () => {
  it("provisioning the same email in two orgs creates two independent Membership rows", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `shared-${Date.now()}@example.com`;

    const rA = await provisionScimUser(
      { email, name: "Shared", active: true, raw: { email } },
      { orgId: orgA.id, roleAttribute: null, roleValueMap: null },
    );
    const rB = await provisionScimUser(
      { email, name: "Shared", active: true, raw: { email } },
      { orgId: orgB.id, roleAttribute: null, roleValueMap: null },
    );

    expect(rA.userId).toBe(rB.userId); // same underlying User row (find-by-email)
    const mA = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: orgA.id, userId: rA.userId } },
    });
    const mB = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: orgB.id, userId: rB.userId } },
    });
    expect(mA).not.toBeNull();
    expect(mB).not.toBeNull();
  });

  it("deprovisioning from org A leaves the same user's org B membership intact", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `cross-${Date.now()}@example.com`;

    const rA = await provisionScimUser(
      { email, name: "Cross", active: true, raw: { email } },
      { orgId: orgA.id, roleAttribute: null, roleValueMap: null },
    );
    await provisionScimUser(
      { email, name: "Cross", active: true, raw: { email } },
      { orgId: orgB.id, roleAttribute: null, roleValueMap: null },
    );

    await deprovisionScimUser(rA.userId, orgA.id);

    const mA = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: orgA.id, userId: rA.userId } },
    });
    const mB = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: orgB.id, userId: rA.userId } },
    });
    expect(mA).toBeNull();
    expect(mB).not.toBeNull();
  });

  it("Membership composite key (orgId_userId) allows the same user to hold one row per org, never a duplicate within an org", async () => {
    const orgA = await makeOrg();
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `composite-${Date.now()}@example.com`;

    await provisionScimUser(
      { email, name: "Composite", active: true, raw: { email } },
      { orgId: orgA.id, roleAttribute: null, roleValueMap: null },
    );
    await provisionScimUser(
      { email, name: "Composite", active: true, raw: { email } },
      { orgId: orgA.id, roleAttribute: null, roleValueMap: null },
    );

    const count = await prisma.membership.count({ where: { orgId: orgA.id } });
    expect(count).toBe(1);
  });
});
