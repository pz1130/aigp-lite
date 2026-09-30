import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";

let orgId: string;
let userId: string;
let dataSourceId: string;
let usecaseId: string;

function context(): TRPCContext {
  return {
    session: {
      userId,
      orgId,
      role: "admin",
      email: "lineage-test@example.com",
    },
  };
}

describe("dataLineage.list", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Lineage ${Date.now()}` },
    });
    orgId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `lineage-${Date.now()}@example.com`,
        name: "Lineage Test",
      },
    });
    userId = user.id;
    await prisma.membership.create({
      data: { orgId, userId, role: "admin" },
    });
    const dataSource = await prisma.dataSource.create({
      data: { orgId, name: "CRM" },
    });
    dataSourceId = dataSource.id;
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId,
        ownerId: userId,
        name: "Support Assistant",
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    usecaseId = usecase.id;
    await prisma.usecaseDataLink.create({
      data: {
        dataSourceId,
        usecaseId,
        direction: "training",
        purpose: "Historical labels",
      },
    });
  });

  afterAll(async () => {
    await prisma.usecaseDataLink.deleteMany({ where: { usecaseId } });
    await prisma.dataSource.delete({ where: { id: dataSourceId } });
    await prisma.aiUsecase.delete({ where: { id: usecaseId } });
    await prisma.membership.delete({
      where: { orgId_userId: { orgId, userId } },
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it("returns linked usecases for graph consumers", async () => {
    const rows = await appRouter.createCaller(context()).dataLineage.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].links).toEqual([
      expect.objectContaining({
        usecaseId,
        direction: "training",
        usecase: { id: usecaseId, name: "Support Assistant" },
      }),
    ]);
  });
});
