import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

const TAG = "DEPFIELDS";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("AiUsecase deprecation fields", () => {
  it("persists sunsetDate, deprecatedAt, deprecatedById, deprecationReason", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `df-${Date.now()}@t.local`,
        name: "DF",
        passwordHash: "x",
      },
    });
    const sunset = new Date("2026-12-31T00:00:00.000Z");
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-uc`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
        lifecycleStage: "deprecated",
        sunsetDate: sunset,
        deprecatedAt: new Date(),
        deprecatedById: user.id,
        deprecationReason: "superseded by v2",
      },
    });
    const got = await prisma.aiUsecase.findUniqueOrThrow({
      where: { id: uc.id },
    });
    expect(got.sunsetDate?.toISOString()).toBe(sunset.toISOString());
    expect(got.deprecatedById).toBe(user.id);
    expect(got.deprecationReason).toBe("superseded by v2");
    expect(got.deprecatedAt).not.toBeNull();
  });
});
