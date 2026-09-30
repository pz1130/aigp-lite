import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { buildOrgSnapshot } from "./org-aggregate";

function tag() {
  return (
    "TXR-ORG-AGG-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)
  );
}

async function cleanup() {
  await prisma.incident.deleteMany({
    where: { title: { startsWith: "TXR-ORG-AGG-" } },
  });
  await prisma.frtAnswer.deleteMany({
    where: { assessment: { title: { startsWith: "TXR-ORG-AGG-" } } },
  });
  await prisma.frtAssessment.deleteMany({
    where: { title: { startsWith: "TXR-ORG-AGG-" } },
  });
  await prisma.frtThreshold.deleteMany({
    where: { code: { startsWith: "FRT-TXRORGAGG_" } },
  });
  await prisma.frtCategory.deleteMany({
    where: { code: { startsWith: "TXRORGAGG_" } },
  });
  await prisma.usecaseClassification.deleteMany({
    where: { usecase: { name: { startsWith: "TXR-ORG-AGG-" } } },
  });
  await prisma.aiUsecase.deleteMany({
    where: { name: { startsWith: "TXR-ORG-AGG-" } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: "TXR-ORG-AGG-" } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

export async function seedPortfolioOrg() {
  const TAG = tag();
  const catCode = "TXRORGAGG_" + TAG.slice(-8);
  const org = await prisma.organization.create({
    data: { name: TAG + "-org" },
  });
  const user = await prisma.user.create({
    data: {
      email: `txrorg-${Date.now()}@t.local`,
      name: "Owner",
      passwordHash: "x",
    },
  });
  const base = {
    orgId: org.id,
    ownerId: user.id,
    autonomyLevel: "assistant" as const,
    deploymentType: "built" as const,
  };

  const sysA = await prisma.aiUsecase.create({
    data: { ...base, name: TAG + "A", lifecycleStage: "production" },
  });
  await prisma.aiUsecase.create({
    data: { ...base, name: TAG + "B", lifecycleStage: "development" },
  });
  await prisma.aiUsecase.create({
    data: {
      ...base,
      name: TAG + "C",
      lifecycleStage: "deprecated",
    },
  });
  await prisma.aiUsecase.create({
    data: { ...base, name: TAG + "D", lifecycleStage: "proposed" },
  });

  await prisma.usecaseClassification.create({
    data: {
      orgId: org.id,
      usecaseId: sysA.id,
      euAiActCategory: "high",
      containsPii: false,
      generatedReason: "test",
    },
  });

  const cat = await prisma.frtCategory.create({
    data: {
      code: catCode,
      order: 9200,
      title: "TXR Org Cat",
      summary: "s",
    },
  });
  const t1Code = `FRT-${catCode}-T1-1`;
  const t2Code = `FRT-${catCode}-T2-1`;
  await prisma.frtThreshold.create({
    data: {
      categoryId: cat.id,
      code: t1Code,
      tier: 1,
      order: 1,
      statement: "t1",
    },
  });
  await prisma.frtThreshold.create({
    data: {
      categoryId: cat.id,
      code: t2Code,
      tier: 2,
      order: 1,
      statement: "t2",
    },
  });
  const frt = await prisma.frtAssessment.create({
    data: {
      orgId: org.id,
      usecaseId: sysA.id,
      version: 1,
      status: "approved",
      title: TAG + " frt",
      createdById: user.id,
      approvedById: user.id,
      approvedAt: new Date(),
    },
  });
  await prisma.frtAnswer.createMany({
    data: [
      {
        assessmentId: frt.id,
        thresholdCode: t1Code,
        status: "met",
      },
      {
        assessmentId: frt.id,
        thresholdCode: t2Code,
        status: "met",
      },
    ],
  });

  await prisma.incident.create({
    data: {
      orgId: org.id,
      title: TAG + " in-period",
      severity: "high",
      openedAt: new Date("2026-03-01"),
      openedById: user.id,
      relatedUsecaseId: sysA.id,
    },
  });
  await prisma.incident.create({
    data: {
      orgId: org.id,
      title: TAG + " out-period",
      severity: "low",
      openedAt: new Date("2025-12-01"),
      openedById: user.id,
      relatedUsecaseId: sysA.id,
    },
  });

  return { orgId: org.id, sysAId: sysA.id };
}

describe("buildOrgSnapshot", () => {
  it("rolls up active systems, tiers, readiness, and in-period incidents", async () => {
    const { orgId } = await seedPortfolioOrg();
    const db = withOrg(prisma, orgId);
    const snap = await buildOrgSnapshot(
      db,
      {
        orgId,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-06-30"),
      },
      null,
    );

    expect(snap.totals.systemCount).toBe(3);
    const names = snap.portfolio.map((p) => p.name);
    expect(names.filter((n) => n.endsWith("A")).length).toBe(1);
    expect(names.filter((n) => n.endsWith("B")).length).toBe(1);
    expect(names.filter((n) => n.endsWith("C")).length).toBe(1);
    expect(snap.portfolio.some((p) => p.name.endsWith("C"))).toBe(true);
    expect(snap.totals.worstTier).toBe(2);
    expect(
      snap.totals.tierDistribution["0"] + snap.totals.tierDistribution["2"],
    ).toBeGreaterThan(0);
    expect(snap.totals.incidents.total).toBeGreaterThan(0);
    expect(snap.deltas.priorEdition).toBeNull();
    expect(snap.deltas.systemCount).toEqual({ from: 3, to: 3 });
  });
});
