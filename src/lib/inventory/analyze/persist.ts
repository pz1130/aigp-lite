import { prisma } from "@/lib/db";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";
import type { ClassificationOutput } from "./prompt";

export { SYSTEM_USER_ID };

export interface PersistArgs {
  orgId: string;
  usecaseId: string;
  output: ClassificationOutput;
  modelProvider: string;
  modelName: string;
  reason: string;
}

export async function persistAnalysis(args: PersistArgs): Promise<void> {
  const { orgId, usecaseId, output, modelProvider, modelName, reason } = args;

  await prisma.$transaction([
    prisma.usecaseClassification.upsert({
      where: { usecaseId },
      create: {
        orgId,
        usecaseId,
        domain: output.domain,
        containsPii: output.containsPii,
        dataSensitivity: output.dataSensitivity,
        automatedDecisionMaking: output.automatedDecisionMaking,
        euAiActCategory: output.euAiActCategory,
        complianceTags: output.complianceTags,
        suggestedRisks: output.suggestedRisks,
        summary: output.summary,
        modelProvider,
        modelName,
        confidence: output.confidence,
        generatedReason: reason,
      },
      update: {
        domain: output.domain,
        containsPii: output.containsPii,
        dataSensitivity: output.dataSensitivity,
        automatedDecisionMaking: output.automatedDecisionMaking,
        euAiActCategory: output.euAiActCategory,
        complianceTags: output.complianceTags,
        suggestedRisks: output.suggestedRisks,
        summary: output.summary,
        modelProvider,
        modelName,
        confidence: output.confidence,
        generatedAt: new Date(),
        generatedReason: reason,
      },
    }),
    prisma.usecaseRiskAssessment.create({
      data: {
        orgId,
        usecaseId,
        scoreInt: output.riskScoreInt,
        level:
          output.riskScoreInt < 30
            ? "low"
            : output.riskScoreInt < 70
              ? "medium"
              : "high",
        notes: `LLM-suggested (${modelProvider}/${modelName}) — please review.\n\n${output.summary}`,
        assessedById: SYSTEM_USER_ID,
      },
    }),
  ]);
}
