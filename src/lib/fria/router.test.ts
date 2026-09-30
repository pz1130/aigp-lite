import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import type { Role } from "@/lib/rbac/roles";
import { prisma } from "@/lib/db";

let orgId: string;
let otherOrgId: string;
let creatorId: string;
let approverId: string;
let usecaseId: string;

function ctx(uid: string, oid: string, role: Role): TRPCContext {
  return {
    session: { userId: uid, orgId: oid, role, email: `${uid}@x` },
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `FR ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `FR2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const c = await prisma.user.create({
    data: { email: `frc-${Date.now()}@x`, name: "C", passwordHash: "x" },
  });
  creatorId = c.id;
  const a = await prisma.user.create({
    data: { email: `fra-${Date.now()}@x`, name: "A", passwordHash: "x" },
  });
  approverId = a.id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId: creatorId, role: "ai_owner" },
      { orgId, userId: approverId, role: "risk_officer" },
      { orgId: otherOrgId, userId: creatorId, role: "admin" },
    ],
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId,
      name: `UC ${Date.now()}`,
      ownerId: creatorId,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  usecaseId = uc.id;
});

afterAll(async () => {
  await prisma.usecaseFria.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.aiUsecase.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [creatorId, approverId] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

beforeEach(async () => {
  await prisma.usecaseFria.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
});

describe("fria.create", () => {
  it("ai_owner can create", async () => {
    const caller = appRouter.createCaller(ctx(creatorId, orgId, "ai_owner"));
    const r = await caller.fria.create({ usecaseId, title: "T" });
    expect(r.status).toBe("draft");
  });

  it("viewer cannot create (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(ctx(creatorId, orgId, "viewer"));
    await expect(caller.fria.create({ usecaseId, title: "T" })).rejects.toThrow(
      /lacks|FORBIDDEN|forbidden/i,
    );
  });

  it("writes audit log with action=fria.create", async () => {
    const caller = appRouter.createCaller(ctx(creatorId, orgId, "ai_owner"));
    const r = await caller.fria.create({ usecaseId, title: "T" });
    const audit = await prisma.auditLog.findFirst({
      where: { orgId, resourceId: r.id, action: "fria.create" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("fria.updateSections", () => {
  it("does NOT write audit", async () => {
    const caller = appRouter.createCaller(ctx(creatorId, orgId, "ai_owner"));
    const c = await caller.fria.create({ usecaseId, title: "T" });
    await caller.fria.updateSections({
      id: c.id,
      sections: { system: { name: "Y" } },
    });
    const audits = await prisma.auditLog.findMany({
      where: { orgId, resourceId: c.id, action: { startsWith: "fria.update" } },
    });
    expect(audits).toHaveLength(0);
  });
});

describe("fria.submit / approve / withdraw / supersede / archive", () => {
  it("approver != creator can approve; writes audit with before/after", async () => {
    const cCaller = appRouter.createCaller(ctx(creatorId, orgId, "ai_owner"));
    const aCaller = appRouter.createCaller(
      ctx(approverId, orgId, "risk_officer"),
    );
    const c = await cCaller.fria.create({
      usecaseId,
      title: "T",
      initialSections: { system: { name: "X" } },
    });
    await cCaller.fria.submit({ id: c.id });
    const r = await aCaller.fria.approve({ id: c.id });
    expect(r.status).toBe("approved");

    const audit = await prisma.auditLog.findFirst({
      where: { orgId, resourceId: c.id, action: "fria.approve" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.beforeJson as { status: string }).status).toBe("submitted");
    expect((audit?.afterJson as { status: string }).status).toBe("approved");
  });

  it("ai_owner CANNOT approve (FORBIDDEN)", async () => {
    const cCaller = appRouter.createCaller(ctx(creatorId, orgId, "ai_owner"));
    const c = await cCaller.fria.create({
      usecaseId,
      title: "T",
      initialSections: { system: { name: "X" } },
    });
    await cCaller.fria.submit({ id: c.id });
    await expect(cCaller.fria.approve({ id: c.id })).rejects.toThrow(
      /lacks|FORBIDDEN|forbidden/i,
    );
  });
});

describe("fria.get / listForUsecase — org isolation", () => {
  it("cross-org get returns NOT_FOUND", async () => {
    const cCaller = appRouter.createCaller(ctx(creatorId, orgId, "ai_owner"));
    const otherCaller = appRouter.createCaller(
      ctx(creatorId, otherOrgId, "admin"),
    );
    const c = await cCaller.fria.create({ usecaseId, title: "T" });
    await expect(otherCaller.fria.get({ id: c.id })).rejects.toThrow(
      /NOT_FOUND/,
    );
  });
});
