import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { buildDossierSnapshot } from "@/lib/dossier/aggregate";

const TAG = "DOSSIER-AGG";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("buildDossierSnapshot", () => {
  it("returns null for an unknown usecase", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    expect(
      await buildDossierSnapshot(withOrg(prisma, org.id), org.id, "nope"),
    ).toBeNull();
  });

  it("aggregates classification, incidents and go-live head", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `agg-${Date.now()}@t.local`,
        name: "Agg",
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
      },
    });
    await prisma.usecaseClassification.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        euAiActCategory: "high",
        containsPii: true,
        dataSensitivity: "confidential",
        generatedReason: "t",
      },
    });
    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: `${TAG}-inc`,
        severity: "critical",
        status: "open",
        relatedUsecaseId: uc.id,
        category: "data_leak",
        openedById: user.id,
      },
    });
    const older = await prisma.goLiveReview.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        status: "rejected",
        createdById: user.id,
      },
    });
    const newer = await prisma.goLiveReview.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        status: "approved",
        createdById: user.id,
        decidedById: user.id,
        decidedAt: new Date(),
      },
    });
    await prisma.goLiveReview.update({
      where: { id: older.id },
      data: { supersededById: newer.id },
    });
    await prisma.redteamAttestation.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        attesterName: "Ext",
        scope: "s",
        attestedAt: new Date(),
        storageKey: "x/none.pdf",
        reportSha256: "0".repeat(64),
        reportBytes: 1,
        createdBy: user.id,
      },
    });

    const snap = await buildDossierSnapshot(
      withOrg(prisma, org.id),
      org.id,
      uc.id,
    );
    expect(snap).not.toBeNull();
    expect(snap!.classification.isHighRisk).toBe(true);
    expect(snap!.externalRedteam.attestationCount).toBe(1);
    expect(snap!.classification.containsPii).toBe(true);
    expect(snap!.incidents.openHighOrCritical).toBe(1);
    expect(snap!.goLive?.id).toBe(newer.id);
    expect(snap!.goLive?.status).toBe("approved");
  });

  it("derives effective capability tier from the approved FRT assessment", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-frt-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `frt-${Date.now()}@t.local`,
        name: "FRT",
        passwordHash: "x",
      },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-frt-uc`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    const cat = await prisma.frtCategory.create({
      data: {
        code: `${TAG}-CAT-${Date.now()}`,
        order: 9999,
        title: "Agg cat",
        summary: "s",
      },
    });
    const thCode = `${TAG}-T3-${Date.now()}`;
    await prisma.frtThreshold.create({
      data: {
        categoryId: cat.id,
        code: thCode,
        tier: 3,
        order: 1,
        statement: "tier 3 threshold",
      },
    });
    const assessment = await prisma.frtAssessment.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        title: `${TAG}-frt-assessment`,
        status: "approved",
        createdById: user.id,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
    await prisma.frtAnswer.create({
      data: {
        assessmentId: assessment.id,
        thresholdCode: thCode,
        status: "met",
      },
    });

    const snap = await buildDossierSnapshot(
      withOrg(prisma, org.id),
      org.id,
      uc.id,
    );
    expect(snap!.capability.assessed).toBe(true);
    expect(snap!.capability.effectiveTier).toBe(3);
  });
});
