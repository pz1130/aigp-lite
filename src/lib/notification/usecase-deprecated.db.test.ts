import { describe, it, expect, afterAll } from "vitest";
import { workflowEvents } from "@/lib/events/workflow-bus";
import "./subscribers";
import { prisma } from "@/lib/db";

const TAG = "USECASE-DEP-NOTIF";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

async function flush() {
  await new Promise((r) => setTimeout(r, 200));
}

describe("handleUsecaseDeprecated", () => {
  it("notifies the owner and inventory.write holders, de-duplicated", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const owner = await prisma.user.create({
      data: { email: `own-${Date.now()}@x`, name: "Own", passwordHash: "x" },
    });
    const writer = await prisma.user.create({
      data: { email: `wr-${Date.now()}@x`, name: "Wr", passwordHash: "x" },
    });
    const viewer = await prisma.user.create({
      data: { email: `vw-${Date.now()}@x`, name: "Vw", passwordHash: "x" },
    });
    await prisma.membership.createMany({
      data: [
        { orgId: org.id, userId: owner.id, role: "ai_owner" },
        { orgId: org.id, userId: writer.id, role: "admin" },
        { orgId: org.id, userId: viewer.id, role: "viewer" },
      ],
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-uc`,
        ownerId: owner.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
        lifecycleStage: "deprecated",
      },
    });

    workflowEvents.emitUsecaseDeprecated({
      orgId: org.id,
      usecaseId: uc.id,
      sunsetDate: "2026-12-31T00:00:00.000Z",
      deprecatedByUserId: writer.id,
    });
    await flush();

    const ownerNotifs = await prisma.notification.findMany({
      where: {
        orgId: org.id,
        recipientUserId: owner.id,
        type: "usecase_deprecated",
      },
    });
    const writerNotifs = await prisma.notification.findMany({
      where: {
        orgId: org.id,
        recipientUserId: writer.id,
        type: "usecase_deprecated",
      },
    });
    const viewerNotifs = await prisma.notification.findMany({
      where: {
        orgId: org.id,
        recipientUserId: viewer.id,
        type: "usecase_deprecated",
      },
    });
    expect(ownerNotifs).toHaveLength(1);
    expect(writerNotifs).toHaveLength(1);
    expect(viewerNotifs).toHaveLength(0);
    expect(ownerNotifs[0].linkHref).toBe(`/inventory/${uc.id}`);
  });
});
