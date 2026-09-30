import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";

type Role = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name: "OH-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}
async function makeUser() {
  const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@t.local`;
  return prisma.user.create({ data: { email, name: "U", passwordHash: "x" } });
}
function ctxFor(orgId: string, userId: string, role: Role) {
  return {
    db: prisma,
    session: { orgId, userId, email: "x@t.local", role },
    ip: "127.0.0.1",
  } as const;
}
async function adminCaller() {
  const org = await makeOrg();
  const admin = await makeUser();
  await prisma.membership.create({
    data: { orgId: org.id, userId: admin.id, role: "admin" },
  });
  return {
    org,
    admin,
    caller: appRouter.createCaller(ctxFor(org.id, admin.id, "admin")),
  };
}

describe("orgHierarchy router — attach/detach", () => {
  it("attaches a child and lists it", async () => {
    const hq = await adminCaller();
    const child = await makeOrg();
    await hq.caller.orgHierarchy.attachChild({ childOrgId: child.id });
    const listed = await hq.caller.orgHierarchy.listChildren();
    expect(listed.children.map((c) => c.id)).toContain(child.id);
    const row = await prisma.organization.findUnique({
      where: { id: child.id },
    });
    expect(row!.parentOrgId).toBe(hq.org.id);
  });

  it("detaches a child", async () => {
    const hq = await adminCaller();
    const child = await makeOrg();
    await hq.caller.orgHierarchy.attachChild({ childOrgId: child.id });
    await hq.caller.orgHierarchy.detachChild({ childOrgId: child.id });
    const row = await prisma.organization.findUnique({
      where: { id: child.id },
    });
    expect(row!.parentOrgId).toBeNull();
  });

  it("rejects attaching self", async () => {
    const hq = await adminCaller();
    await expect(
      hq.caller.orgHierarchy.attachChild({ childOrgId: hq.org.id }),
    ).rejects.toThrow(/CONFLICT|self/i);
  });

  it("rejects a non-existent child", async () => {
    const hq = await adminCaller();
    await expect(
      hq.caller.orgHierarchy.attachChild({ childOrgId: "nope" }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });

  it("rejects attaching when the caller is itself a child (max depth 2)", async () => {
    const grandparent = await adminCaller();
    const hq = await adminCaller();
    const child = await makeOrg();
    // make hq a child of grandparent
    await grandparent.caller.orgHierarchy.attachChild({
      childOrgId: hq.org.id,
    });
    await expect(
      hq.caller.orgHierarchy.attachChild({ childOrgId: child.id }),
    ).rejects.toThrow(/CONFLICT/i);
  });

  it("rejects attaching an org that already has children (max depth 2)", async () => {
    const hq = await adminCaller();
    const mid = await adminCaller();
    const leaf = await makeOrg();
    await mid.caller.orgHierarchy.attachChild({ childOrgId: leaf.id });
    await expect(
      hq.caller.orgHierarchy.attachChild({ childOrgId: mid.org.id }),
    ).rejects.toThrow(/CONFLICT/i);
  });

  it("rejects attaching an org already parented elsewhere", async () => {
    const hq1 = await adminCaller();
    const hq2 = await adminCaller();
    const child = await makeOrg();
    await hq1.caller.orgHierarchy.attachChild({ childOrgId: child.id });
    await expect(
      hq2.caller.orgHierarchy.attachChild({ childOrgId: child.id }),
    ).rejects.toThrow(/CONFLICT/i);
  });

  it("rejects a non-admin caller with FORBIDDEN", async () => {
    const org = await makeOrg();
    const viewer = await makeUser();
    await prisma.membership.create({
      data: { orgId: org.id, userId: viewer.id, role: "viewer" },
    });
    const child = await makeOrg();
    const caller = appRouter.createCaller(ctxFor(org.id, viewer.id, "viewer"));
    await expect(
      caller.orgHierarchy.attachChild({ childOrgId: child.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
