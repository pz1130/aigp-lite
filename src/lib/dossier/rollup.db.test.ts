import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { buildReadinessRollup } from "@/lib/dossier/rollup";

const TAG = "DOSSIER-ROLLUP";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

async function seedOrg() {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${Date.now()}-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `rollup-${Date.now()}-${Math.random()}@t.local`,
      name: "Owner",
      passwordHash: "x",
    },
  });
  return { org, user };
}

async function makeUsecase(
  orgId: string,
  ownerId: string,
  name: string,
  lifecycleStage: "development" | "production" | "proposed" | "retired",
) {
  return prisma.aiUsecase.create({
    data: {
      orgId,
      name: `${TAG}-${name}`,
      ownerId,
      autonomyLevel: "assistant",
      deploymentType: "built",
      lifecycleStage,
    },
  });
}

describe("buildReadinessRollup", () => {
  it("blocks high-risk systems first, excludes non-blocked and out-of-scope systems, and counts states", async () => {
    const { org, user } = await seedOrg();
    const db = withOrg(prisma, org.id);

    // 1) High-risk, production: classified + risk assessment present, but no FRIA and no red-team
    //    -> not_ready, blocked, isHighRisk, blockingCheckIds include fria + redteam.
    const highRisk = await makeUsecase(
      org.id,
      user.id,
      "highrisk",
      "production",
    );
    await prisma.usecaseClassification.create({
      data: {
        orgId: org.id,
        usecaseId: highRisk.id,
        euAiActCategory: "high",
        containsPii: false,
        generatedReason: "t",
      },
    });
    await prisma.usecaseRiskAssessment.create({
      data: {
        orgId: org.id,
        usecaseId: highRisk.id,
        assessedById: user.id,
        scoreInt: 5,
        level: "high",
      },
    });

    // 2) Low-risk, development, no classification -> classified check fails -> not_ready, blocked, not high-risk.
    const lowBlocked = await makeUsecase(
      org.id,
      user.id,
      "lowblocked",
      "development",
    );

    // 3) Low-risk, production: classified + risk assessment -> blocking checks pass, advisory items open
    //    -> conditionally_ready, NOT blocked.
    const conditional = await makeUsecase(
      org.id,
      user.id,
      "conditional",
      "production",
    );
    await prisma.usecaseClassification.create({
      data: {
        orgId: org.id,
        usecaseId: conditional.id,
        euAiActCategory: "minimal",
        containsPii: false,
        generatedReason: "t",
      },
    });
    await prisma.usecaseRiskAssessment.create({
      data: {
        orgId: org.id,
        usecaseId: conditional.id,
        assessedById: user.id,
        scoreInt: 3,
        level: "low",
      },
    });

    // 4) Out-of-scope: a retired and a proposed system must be ignored entirely.
    await makeUsecase(org.id, user.id, "retired", "retired");
    await makeUsecase(org.id, user.id, "proposed", "proposed");

    const rollup = await buildReadinessRollup(db, org.id);

    // Only the two in-scope not_ready systems are blocked, high-risk first.
    expect(rollup.blocked.map((b) => b.usecaseId)).toEqual([
      highRisk.id,
      lowBlocked.id,
    ]);
    expect(rollup.blocked[0].isHighRisk).toBe(true);
    expect(rollup.blocked[0].blockingCheckIds).toEqual(
      expect.arrayContaining(["fria", "redteam"]),
    );
    expect(rollup.blocked[0].euAiActCategory).toBe("high");
    expect(rollup.blocked.map((b) => b.usecaseId)).not.toContain(
      conditional.id,
    );

    // Counts cover only the 3 in-scope systems (retired + proposed excluded).
    expect(rollup.counts.not_ready).toBe(2);
    expect(rollup.counts.conditionally_ready).toBe(1);
    expect(rollup.counts.highRiskBlocked).toBe(1);
    expect(
      rollup.counts.ready +
        rollup.counts.conditionally_ready +
        rollup.counts.not_ready +
        rollup.counts.needs_re_review +
        rollup.counts.live,
    ).toBe(3);
  });
});
