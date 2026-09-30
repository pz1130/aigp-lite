import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

const TAG = "DOSSIER-SCHEMA";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("dossier schema", () => {
  it("persists GoLiveReview, usecase-linked Evaluation, and oversight columns", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `ds-${Date.now()}@t.local`,
        name: "DS",
        passwordHash: "x",
      },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-uc`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
        humanOversightAttested: true,
        humanOversightAttestedById: user.id,
        humanOversightAttestedAt: new Date(),
      },
    });
    const review = await prisma.goLiveReview.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        status: "approved",
        rationale: "ok",
        conditions: ["monitor drift weekly"],
        readinessSnapshot: { state: "ready" },
        decidedById: user.id,
        decidedAt: new Date(),
        createdById: user.id,
      },
    });
    expect(review.status).toBe("approved");
    expect(review.conditions).toEqual(["monitor drift weekly"]);

    const reloaded = await prisma.aiUsecase.findUniqueOrThrow({
      where: { id: uc.id },
    });
    expect(reloaded.humanOversightAttested).toBe(true);
  });
});
