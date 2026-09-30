import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";

const TAG = "REINSTATE-RT";

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

async function seedDeprecated(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${tag}-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `ri-${tag}-${Date.now()}@t.local`,
      name: "RI",
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
      lifecycleStage: "deprecated",
      deprecatedAt: new Date(),
      deprecatedById: user.id,
      sunsetDate: new Date("2026-12-31T00:00:00.000Z"),
      deprecationReason: "old",
    },
  });
  return { uc, caller: appRouter.createCaller(ctx(org.id, user.id)) };
}

describe("inventory.update reinstate/retire semantics", () => {
  it("clears deprecation fields when moving deprecated -> production", async () => {
    const { uc, caller } = await seedDeprecated("reinstate");
    const after = await caller.inventory.update({
      id: uc.id,
      lifecycleStage: "production",
    });
    expect(after.lifecycleStage).toBe("production");
    expect(after.sunsetDate).toBeNull();
    expect(after.deprecatedAt).toBeNull();
    expect(after.deprecatedById).toBeNull();
    expect(after.deprecationReason).toBe("");
  });

  it("keeps deprecation fields when moving deprecated -> retired", async () => {
    const { uc, caller } = await seedDeprecated("retire");
    const after = await caller.inventory.update({
      id: uc.id,
      lifecycleStage: "retired",
    });
    expect(after.lifecycleStage).toBe("retired");
    expect(after.deprecatedById).not.toBeNull();
    expect(after.deprecationReason).toBe("old");
    expect(after.sunsetDate).not.toBeNull();
  });
});
