import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";

const TAG = "er-router-test";

function caller(orgId: string, role: string, userId: string) {
  return appRouter.createCaller({
    session: { userId, orgId, role, email: `${TAG}@e.com` },
  } as TRPCContext);
}

afterAll(async () => {
  await prisma.externalReport.deleteMany({
    where: { title: { startsWith: TAG } },
  });
  await prisma.aiUsecase.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
});

describe("externalReportsRouter", () => {
  it("isolates reports by org and enforces read permission", async () => {
    const orgA = await prisma.organization.create({
      data: { name: `${TAG}-a` },
    });
    const orgB = await prisma.organization.create({
      data: { name: `${TAG}-b` },
    });
    const owner = await prisma.user.create({
      data: { email: `${TAG}-o@e.com`, name: "o", passwordHash: "x" },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: orgA.id,
        name: `${TAG}-sys`,
        ownerId: owner.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    await prisma.externalReport.create({
      data: {
        orgId: orgA.id,
        usecaseId: uc.id,
        type: "vulnerability",
        title: `${TAG} r`,
        description: "d",
      },
    });

    const aList = await caller(
      orgA.id,
      "risk_officer",
      "u1",
    ).externalReports.list({});
    expect(aList.length).toBe(1);

    const bList = await caller(
      orgB.id,
      "risk_officer",
      "u2",
    ).externalReports.list({});
    expect(bList.length).toBe(0);
  });

  it("blocks transition for a viewer (no write)", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-c` },
    });
    const owner = await prisma.user.create({
      data: { email: `${TAG}-o2@e.com`, name: "o", passwordHash: "x" },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-sys2`,
        ownerId: owner.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    const report = await prisma.externalReport.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        type: "vulnerability",
        title: `${TAG} r2`,
        description: "d",
      },
    });
    await expect(
      caller(org.id, "viewer", "u3").externalReports.transition({
        id: report.id,
        status: "triaging",
      }),
    ).rejects.toThrow();
  });
});
