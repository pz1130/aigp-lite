import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import type { Role } from "@/lib/rbac/roles";
import { prisma } from "@/lib/db";
import { writeAudit } from "./log";

let orgId: string;
let userId: string;
let viewerUserId: string;

function ctx(uid: string, role: Role): TRPCContext {
  return { session: { userId: uid, orgId, role, email: `${uid}@x` } };
}

beforeAll(async () => {
  const o = await prisma.organization.create({
    data: { name: `AR ${Date.now()}` },
  });
  orgId = o.id;
  const u = await prisma.user.create({
    data: { email: `ar-${Date.now()}@x`, name: "AR", passwordHash: "x" },
  });
  userId = u.id;
  const v = await prisma.user.create({
    data: { email: `arv-${Date.now()}@x`, name: "ARV", passwordHash: "x" },
  });
  viewerUserId = v.id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId, role: "admin" },
      { orgId, userId: viewerUserId, role: "viewer" },
    ],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, viewerUserId] } },
  });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { orgId } });
});

describe("audit.chainStats", () => {
  it("returns null fields for empty chain", async () => {
    const caller = appRouter.createCaller(ctx(userId, "admin"));
    const r = await caller.audit.chainStats();
    expect(r.totalRows).toBe(0);
    expect(r.lastSeq).toBeNull();
  });

  it("returns head summary after writes", async () => {
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.x",
      resourceType: "t",
    });
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.y",
      resourceType: "t",
    });
    const caller = appRouter.createCaller(ctx(userId, "admin"));
    const r = await caller.audit.chainStats();
    expect(r.totalRows).toBe(2);
    expect(r.firstSeq).toBe(1);
    expect(r.lastSeq).toBe(2);
  });
});

describe("audit.verifyChain", () => {
  it("admin can verify a clean chain", async () => {
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.x",
      resourceType: "t",
    });
    const caller = appRouter.createCaller(ctx(userId, "admin"));
    const r = await caller.audit.verifyChain();
    expect(r.ok).toBe(true);
  });

  it("writes a meta-audit entry on success", async () => {
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.x",
      resourceType: "t",
    });
    const caller = appRouter.createCaller(ctx(userId, "admin"));
    await caller.audit.verifyChain();
    const meta = await prisma.auditLog.findFirst({
      where: { orgId, action: "audit.verify_chain" },
    });
    expect(meta).not.toBeNull();
    expect((meta?.afterJson as { ok: boolean }).ok).toBe(true);
  });

  it("viewer cannot call verifyChain (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(ctx(viewerUserId, "viewer"));
    await expect(caller.audit.verifyChain()).rejects.toThrow(
      /lacks|FORBIDDEN|forbidden/i,
    );
  });

  it("honors range params (fromSeq/toSeq)", async () => {
    for (let i = 0; i < 5; i++) {
      await writeAudit({
        orgId,
        actorId: userId,
        action: "test.x",
        resourceType: "t",
        resourceId: `r${i}`,
      });
    }
    const caller = appRouter.createCaller(ctx(userId, "admin"));
    const r = await caller.audit.verifyChain({ fromSeq: 2, toSeq: 4 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalChecked).toBe(3);
  });
});
