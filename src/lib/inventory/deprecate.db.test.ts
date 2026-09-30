import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { workflowEvents } from "@/lib/events/workflow-bus";

const TAG = "DEPRECATE-RT";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

function ctx(orgId: string, userId: string): TRPCContext {
  return {
    session: { userId, orgId, role: "admin", email: `${userId}@x` },
  };
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${tag}-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `dep-${tag}-${Date.now()}@t.local`,
      name: "Dep",
      passwordHash: "x",
    },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      name: `${TAG}-${tag}-uc`,
      ownerId: user.id,
      autonomyLevel: "assistant",
      deploymentType: "built",
      lifecycleStage: "production",
    },
  });
  return {
    org,
    user,
    uc,
    caller: appRouter.createCaller(ctx(org.id, user.id)),
  };
}

describe("inventory.deprecate", () => {
  it("deprecates an active system, records metadata, audit, and emits the event", async () => {
    const { org, user, uc, caller } = await seed("ok");
    const spy = vi.spyOn(workflowEvents, "emitUsecaseDeprecated");
    const res = await caller.inventory.deprecate({
      usecaseId: uc.id,
      sunsetDate: "2026-12-31T00:00:00.000Z",
      reason: "superseded by v2",
    });
    expect(res.lifecycleStage).toBe("deprecated");
    expect(res.deprecatedById).toBe(user.id);
    expect(res.deprecationReason).toBe("superseded by v2");
    expect(res.deprecatedAt).not.toBeNull();
    expect(res.sunsetDate?.toISOString()).toBe("2026-12-31T00:00:00.000Z");

    const audit = await prisma.auditLog.findFirst({
      where: { orgId: org.id, action: "usecase.deprecated", resourceId: uc.id },
    });
    expect(audit).not.toBeNull();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        usecaseId: uc.id,
        deprecatedByUserId: user.id,
      }),
    );
    spy.mockRestore();
  });

  it("rejects deprecating an already-deprecated system", async () => {
    const { uc, caller } = await seed("dupe");
    await caller.inventory.deprecate({ usecaseId: uc.id });
    await expect(
      caller.inventory.deprecate({ usecaseId: uc.id }),
    ).rejects.toThrow("invalid_deprecation_transition");
  });

  it("rejects deprecating a retired system", async () => {
    const { uc, caller } = await seed("retired");
    await prisma.aiUsecase.update({
      where: { id: uc.id },
      data: { lifecycleStage: "retired" },
    });
    await expect(
      caller.inventory.deprecate({ usecaseId: uc.id }),
    ).rejects.toThrow("invalid_deprecation_transition");
  });
});
