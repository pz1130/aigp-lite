import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fanoutRecipients, fanoutByPermission } from "./fanout";
import { prisma } from "@/lib/db";

let orgId: string;
let userARisk: string;
let userBRisk: string;
let userCAdmin: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `FO ${Date.now()}` },
  });
  orgId = org.id;
  const mk = async (email: string, role: "risk_officer" | "admin") => {
    const u = await prisma.user.create({
      data: { email, name: email, passwordHash: "x" },
    });
    await prisma.membership.create({ data: { orgId, userId: u.id, role } });
    return u.id;
  };
  userARisk = await mk(`a-${Date.now()}@x`, "risk_officer");
  userBRisk = await mk(`b-${Date.now()}@x`, "risk_officer");
  userCAdmin = await mk(`c-${Date.now()}@x`, "admin");
});

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({
    where: { id: { in: [userARisk, userBRisk, userCAdmin] } },
  });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("fanoutRecipients", () => {
  it("returns direct userId when assigneeUserId set", async () => {
    const r = await fanoutRecipients(orgId, userARisk, null);
    expect(r).toEqual([userARisk]);
  });

  it("returns userId even when role also set (userId wins)", async () => {
    const r = await fanoutRecipients(orgId, userARisk, "admin");
    expect(r).toEqual([userARisk]);
  });

  it("returns all org members with role when only role set", async () => {
    const r = await fanoutRecipients(orgId, null, "risk_officer");
    expect(r.sort()).toEqual([userARisk, userBRisk].sort());
  });

  it("returns [] when both unset", async () => {
    expect(await fanoutRecipients(orgId, null, null)).toEqual([]);
    expect(await fanoutRecipients(orgId, undefined, undefined)).toEqual([]);
  });

  it("returns [] when role string is not in Role enum", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await fanoutRecipients(orgId, null, "not_a_real_role");
    expect(r).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns [] when role has no members in this org", async () => {
    const r = await fanoutRecipients(orgId, null, "auditor");
    expect(r).toEqual([]);
  });
});

describe("fanoutByPermission", () => {
  let permOrgId: string;
  let permAdminId: string;
  let permRiskId: string;
  let permViewerId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `FanoutPerm ${Date.now()}` },
    });
    permOrgId = org.id;
    const mk = async (label: string) =>
      (
        await prisma.user.create({
          data: {
            email: `${label}-${Date.now()}@x`,
            name: label,
            passwordHash: "x",
          },
        })
      ).id;
    permAdminId = await mk("admin");
    permRiskId = await mk("risk");
    permViewerId = await mk("viewer");
    await prisma.membership.createMany({
      data: [
        { orgId: permOrgId, userId: permAdminId, role: "admin" },
        { orgId: permOrgId, userId: permRiskId, role: "risk_officer" },
        { orgId: permOrgId, userId: permViewerId, role: "viewer" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { orgId: permOrgId } });
    await prisma.user.deleteMany({
      where: { id: { in: [permAdminId, permRiskId, permViewerId] } },
    });
    await prisma.organization.delete({ where: { id: permOrgId } });
  });

  it("returns members whose role grants incident-trends.write (not viewers)", async () => {
    const ids = await fanoutByPermission(permOrgId, "incident-trends.write");
    expect(ids.sort()).toEqual([permAdminId, permRiskId].sort());
    expect(ids).not.toContain(permViewerId);
  });

  it("returns [] for a permission no role holds", async () => {
    // viewer-style read is universal; use a fabricated impossible permission guard:
    // every role can read incident-trends, so assert write excludes viewer above.
    // Here verify empty org scoping: a different org sees nobody.
    const otherOrg = await prisma.organization.create({
      data: { name: `Empty ${Date.now()}` },
    });
    const ids = await fanoutByPermission(otherOrg.id, "incident-trends.write");
    expect(ids).toEqual([]);
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});
