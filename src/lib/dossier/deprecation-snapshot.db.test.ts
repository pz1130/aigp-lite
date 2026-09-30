import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { buildDossierSnapshot } from "./aggregate";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";

const TAG = "DEP-SNAP";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("buildDossierSnapshot deprecation fields", () => {
  it("surfaces sunsetDate, deprecatedAt, reason and the deprecator's name", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `ds-${Date.now()}@t.local`,
        name: "Deprecator",
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
        lifecycleStage: "deprecated",
        deprecatedAt: new Date(),
        deprecatedById: user.id,
        sunsetDate: new Date("2026-12-31T00:00:00.000Z"),
        deprecationReason: "superseded",
      },
    });
    const snap = await buildDossierSnapshot(
      prisma as unknown as OrgScopedClient,
      org.id,
      uc.id,
    );
    expect(snap).not.toBeNull();
    expect(snap!.system.deprecationReason).toBe("superseded");
    expect(snap!.system.deprecatedByName).toBe("Deprecator");
    expect(snap!.system.sunsetDate?.toISOString()).toBe(
      "2026-12-31T00:00:00.000Z",
    );
    expect(snap!.system.deprecatedAt).not.toBeNull();
  });
});
