import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";

// AiModelVersion has no orgId, so withOrg can't scope it; these pin the
// parent-usecase checks that stand in for it.
const TAG = "MV-ISO";

type Tenant = {
  usecaseId: string;
  caller: ReturnType<typeof appRouter.createCaller>;
};

async function seedTenant(tag: string): Promise<Tenant> {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${tag}-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `mv-${tag}-${Date.now()}@t.local`, name: tag },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: `${tag} system`,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  const ctx: TRPCContext = {
    session: { userId: user.id, orgId: org.id, role: "admin", email: "x@x" },
  };
  return { usecaseId: uc.id, caller: appRouter.createCaller(ctx) };
}

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await seedTenant("a");
  b = await seedTenant("b");
});

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("inventory model versions — tenant isolation", () => {
  it("lists only versions of the caller's own usecases", async () => {
    await b.caller.inventory.modelVersionCreate({
      usecaseId: b.usecaseId,
      version: "b-1",
    });
    expect(
      await a.caller.inventory.modelVersionList({ usecaseId: b.usecaseId }),
    ).toEqual([]);
    expect(
      await b.caller.inventory.modelVersionList({ usecaseId: b.usecaseId }),
    ).toHaveLength(1);
  });

  it("cannot create a version under another org's usecase", async () => {
    await expect(
      a.caller.inventory.modelVersionCreate({
        usecaseId: b.usecaseId,
        version: "sneaky",
      }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("cannot update another org's version", async () => {
    const v = await b.caller.inventory.modelVersionCreate({
      usecaseId: b.usecaseId,
      version: "b-2",
    });
    await expect(
      a.caller.inventory.modelVersionUpdate({ id: v.id, version: "pwned" }),
    ).rejects.toThrow("NOT_FOUND");
    const row = await prisma.aiModelVersion.findUnique({ where: { id: v.id } });
    expect(row?.version).toBe("b-2");
  });

  it("cannot move its own version under another org's usecase", async () => {
    const v = await a.caller.inventory.modelVersionCreate({
      usecaseId: a.usecaseId,
      version: "a-1",
    });
    await expect(
      a.caller.inventory.modelVersionUpdate({
        id: v.id,
        usecaseId: b.usecaseId,
      }),
    ).rejects.toThrow("NOT_FOUND");
    const row = await prisma.aiModelVersion.findUnique({ where: { id: v.id } });
    expect(row?.usecaseId).toBe(a.usecaseId);
  });

  it("still updates its own version", async () => {
    const v = await a.caller.inventory.modelVersionCreate({
      usecaseId: a.usecaseId,
      version: "a-2",
    });
    const updated = await a.caller.inventory.modelVersionUpdate({
      id: v.id,
      modelCardMd: "# card",
    });
    expect(updated.modelCardMd).toBe("# card");
  });
});
