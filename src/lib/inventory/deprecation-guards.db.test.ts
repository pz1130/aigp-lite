import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";

const TAG = "DEPGUARD-RT";

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
      email: `dg-${tag}-${Date.now()}@t.local`,
      name: "DG",
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
    },
  });
  return {
    org,
    user,
    uc,
    caller: appRouter.createCaller(ctx(org.id, user.id)),
  };
}

describe("deprecation enforcement guards", () => {
  it("recordDecision blocks approval of a deprecated system", async () => {
    const { uc, caller } = await seedDeprecated("approve");
    await expect(
      caller.dossier.recordDecision({
        usecaseId: uc.id,
        status: "approved",
        rationale: "x",
      }),
    ).rejects.toThrow("system_deprecated");
  });

  it("recordDecision blocks marking a deprecated system live", async () => {
    const { uc, caller } = await seedDeprecated("live");
    await expect(
      caller.dossier.recordDecision({
        usecaseId: uc.id,
        status: "live",
        rationale: "x",
      }),
    ).rejects.toThrow("system_deprecated");
  });

  it("recordDecision still allows rejecting a deprecated system", async () => {
    const { uc, caller } = await seedDeprecated("reject");
    const dec = await caller.dossier.recordDecision({
      usecaseId: uc.id,
      status: "rejected",
      rationale: "close out",
    });
    expect(dec.status).toBe("rejected");
  });

  it("modelVersionCreate blocks a new version on a deprecated system", async () => {
    const { uc, caller } = await seedDeprecated("mv");
    await expect(
      caller.inventory.modelVersionCreate({ usecaseId: uc.id, version: "v9" }),
    ).rejects.toThrow("system_deprecated");
  });
});
