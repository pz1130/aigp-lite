import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { persistAnalysis, SYSTEM_USER_ID } from "./persist";
import type { ClassificationOutput } from "./prompt";

let orgId: string;
let usecaseId: string;

const baseOutput: ClassificationOutput = {
  domain: "finance",
  containsPii: true,
  dataSensitivity: "high",
  automatedDecisionMaking: true,
  euAiActCategory: "high",
  complianceTags: ["EU_AI_ACT", "ISO_42001"],
  suggestedRisks: [
    {
      title: "Bias in scoring",
      severity: "high",
      rationale: "ML model may discriminate.",
    },
  ],
  summary: "Credit scoring model with PII.",
  confidence: 0.85,
  riskScoreInt: 72,
};

beforeAll(async () => {
  await prisma.usecaseControlStatus.deleteMany();
  await prisma.usecaseClassification.deleteMany();
  await prisma.usecaseRiskAssessment.deleteMany();
  await prisma.aiModelVersion.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "PersistOrg" },
  });
  orgId = org.id;

  const hash = await hashPassword("testtest");
  await prisma.user.create({
    data: {
      id: SYSTEM_USER_ID,
      email: "system@internal",
      name: "System",
      passwordHash: hash,
    },
  });

  const usecase = await prisma.aiUsecase.create({
    data: {
      orgId,
      name: "Credit Scorer",
      autonomyLevel: "simple_agent",
      deploymentType: "built",
      ownerId: SYSTEM_USER_ID,
    },
  });
  usecaseId = usecase.id;
});

afterAll(async () => {
  await prisma.usecaseControlStatus.deleteMany();
  await prisma.usecaseClassification.deleteMany();
  await prisma.usecaseRiskAssessment.deleteMany();
  await prisma.aiModelVersion.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
});

describe("persistAnalysis", () => {
  it("creates classification and risk assessment on first call", async () => {
    await persistAnalysis({
      orgId,
      usecaseId,
      output: baseOutput,
      modelProvider: "openai",
      modelName: "gpt-4o-mini",
      reason: "manual",
    });

    const cls = await prisma.usecaseClassification.findUnique({
      where: { usecaseId },
    });
    expect(cls).not.toBeNull();
    expect(cls!.domain).toBe("finance");
    expect(cls!.containsPii).toBe(true);
    expect(cls!.dataSensitivity).toBe("high");
    expect(cls!.euAiActCategory).toBe("high");
    expect(cls!.complianceTags).toEqual(["EU_AI_ACT", "ISO_42001"]);
    expect(cls!.confidence).toBe(0.85);
    expect(cls!.modelProvider).toBe("openai");
    expect(cls!.modelName).toBe("gpt-4o-mini");
    expect(cls!.generatedReason).toBe("manual");

    const assessments = await prisma.usecaseRiskAssessment.findMany({
      where: { usecaseId },
      orderBy: { assessedAt: "asc" },
    });
    expect(assessments).toHaveLength(1);
    expect(assessments[0].scoreInt).toBe(72);
    expect(assessments[0].level).toBe("high");
    expect(assessments[0].assessedById).toBe(SYSTEM_USER_ID);
  });

  it("upserts classification and appends risk assessment on second call", async () => {
    const updated: ClassificationOutput = {
      ...baseOutput,
      summary: "Updated summary.",
      confidence: 0.95,
      riskScoreInt: 45,
    };

    await persistAnalysis({
      orgId,
      usecaseId,
      output: updated,
      modelProvider: "anthropic",
      modelName: "claude-3-5-sonnet-latest",
      reason: "auto_updated",
    });

    const cls = await prisma.usecaseClassification.findUnique({
      where: { usecaseId },
    });
    expect(cls!.summary).toBe("Updated summary.");
    expect(cls!.confidence).toBe(0.95);
    expect(cls!.modelProvider).toBe("anthropic");
    expect(cls!.modelName).toBe("claude-3-5-sonnet-latest");
    expect(cls!.generatedReason).toBe("auto_updated");

    const assessments = await prisma.usecaseRiskAssessment.findMany({
      where: { usecaseId },
      orderBy: { assessedAt: "asc" },
    });
    expect(assessments).toHaveLength(2);
    expect(assessments[1].scoreInt).toBe(45);
    expect(assessments[1].level).toBe("medium");
  });

  it("derives risk level correctly", async () => {
    const cases: Array<{ score: number; level: string }> = [
      { score: 10, level: "low" },
      { score: 29, level: "low" },
      { score: 30, level: "medium" },
      { score: 69, level: "medium" },
      { score: 70, level: "high" },
      { score: 100, level: "high" },
    ];

    for (const { score } of cases) {
      await persistAnalysis({
        orgId,
        usecaseId,
        output: { ...baseOutput, riskScoreInt: score },
        modelProvider: "test",
        modelName: "test",
        reason: "manual",
      });
    }

    const all = await prisma.usecaseRiskAssessment.findMany({
      where: { usecaseId },
      orderBy: { assessedAt: "desc" },
      take: cases.length,
    });

    // Most recent first, so reverse to match input order
    const reversed = all.reverse();
    for (let i = 0; i < cases.length; i++) {
      expect(reversed[i].level).toBe(cases[i].level);
    }
  });
});
