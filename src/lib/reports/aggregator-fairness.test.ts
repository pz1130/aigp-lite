import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { aggregate } from "./aggregator";
import type { ReportTemplate } from "./types";
import { saveDraft, completeAssessment } from "@/lib/fairness/service";

const ORG = "org-fair-agg";
const USER = "user-fair-agg";
const PERIOD = { start: new Date("2000-01-01"), end: new Date("2100-01-01") };

const template: ReportTemplate = {
  id: "mindforge",
  displayKey: "reports.templates.mindforge",
  version: "test",
  controls: [
    {
      id: "C7",
      title: "Model Development & Validation",
      category: "3. AI Lifecycle Management",
      description:
        "Develop and validate models with fairness, robustness and independent challenge before production release.",
      dataSource: "fairness_assessment",
      query: {},
    },
  ],
};

async function makeUsecase(id: string, tier: "limited" | "high" | "critical") {
  await prisma.aiUsecase.upsert({
    where: { id },
    update: {},
    create: {
      id,
      orgId: ORG,
      name: `uc-${id}`,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  await prisma.usecaseMateriality.upsert({
    where: { usecaseId: id },
    update: { computedTier: tier, tierOverride: null },
    create: {
      orgId: ORG,
      usecaseId: id,
      computedTier: tier,
      assessedById: USER,
      affectedParties: 0,
      decisionConsequence: 0,
      financialSafety: 0,
      dataSensitivity: 0,
    },
  });
}

async function fairFor(
  usecaseId: string,
  subgroups: { label: string; value: number }[],
) {
  await saveDraft({
    orgId: ORG,
    actorId: USER,
    ip: "127.0.0.1",
    usecaseId,
    proxyReview: "yes",
    feedbackLoop: "yes",
    attributes: [{ name: "gender", metric: "selection_rate", subgroups }],
  });
  await completeAssessment({
    orgId: ORG,
    actorId: USER,
    ip: "127.0.0.1",
    usecaseId,
  });
}

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Fair Agg Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "fa@test.local", name: "FA" },
  });
});

beforeEach(async () => {
  await prisma.fairnessSubgroup.deleteMany({
    where: { attribute: { assessment: { orgId: ORG } } },
  });
  await prisma.fairnessAttribute.deleteMany({
    where: { assessment: { orgId: ORG } },
  });
  await prisma.usecaseFairnessAssessment.deleteMany({ where: { orgId: ORG } });
  await prisma.usecaseMateriality.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
});

describe("aggregator: fairness_assessment (C7)", () => {
  it("no high/critical use cases -> n/a", async () => {
    await makeUsecase("uc-lim", "limited");
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("n/a");
  });

  it("required use case with a passing completed assessment -> implemented", async () => {
    await makeUsecase("uc-hi", "high");
    await fairFor("uc-hi", [
      { label: "f", value: 0.45 },
      { label: "m", value: 0.5 },
    ]);
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("implemented");
    expect(result.controls[0].evidenceCount).toBe(1);
  });

  it("required use case with a disparity -> not-implemented", async () => {
    await makeUsecase("uc-hi2", "high");
    await fairFor("uc-hi2", [
      { label: "f", value: 0.2 },
      { label: "m", value: 0.5 },
    ]);
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("not-implemented");
  });

  it("required use case with no assessment -> not-implemented", async () => {
    await makeUsecase("uc-hi3", "critical");
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("not-implemented");
  });

  it("one passing + one missing -> partial", async () => {
    await makeUsecase("uc-ok", "high");
    await makeUsecase("uc-missing", "critical");
    await fairFor("uc-ok", [
      { label: "f", value: 0.45 },
      { label: "m", value: 0.5 },
    ]);
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("partial");
  });
});
