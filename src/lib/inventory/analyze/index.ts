import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { callAnalysisLlm, NoProviderError } from "./llm";
import { parseClassification } from "./prompt";
import { persistAnalysis } from "./persist";

export type AnalyzeReason = "auto_created" | "auto_updated" | "manual";

export interface AnalyzeArgs {
  orgId: string;
  usecaseId: string;
  reason: AnalyzeReason;
  actorId?: string;
}

export async function runAnalysis(args: AnalyzeArgs): Promise<void> {
  const { orgId, usecaseId, reason, actorId } = args;

  const usecase = await prisma.aiUsecase.findFirst({
    where: { id: usecaseId, orgId },
  });
  if (!usecase) return;

  try {
    const { raw, modelProvider, modelName } = await callAnalysisLlm(orgId, {
      name: usecase.name,
      autonomyLevel: usecase.autonomyLevel,
      deploymentType: usecase.deploymentType,
      description: usecase.description,
      modelCardMd: usecase.modelCardMd,
    });
    const output = parseClassification(raw);

    await persistAnalysis({
      orgId,
      usecaseId,
      output,
      modelProvider,
      modelName,
      reason,
    });

    await writeAudit({
      orgId,
      actorId: actorId ?? "00000000-0000-0000-0000-000000000001",
      action: "usecase.analyze",
      resourceType: "ai_usecase",
      resourceId: usecaseId,
      after: {
        reason,
        modelProvider,
        modelName,
        riskScoreInt: output.riskScoreInt,
        confidence: output.confidence,
      },
    });
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    const code = err instanceof NoProviderError ? "no_provider" : "error";
    if (
      message.includes("Unsupported state") ||
      message.includes("unable to authenticate")
    ) {
      message =
        "Provider credentials could not be decrypted. Please re-save your provider connection in Settings → Integrations.";
    }
    console.error(
      `[inventory-analyze] ${code} for usecase ${usecaseId}:`,
      message,
    );
    await writeAudit({
      orgId,
      actorId: actorId ?? "00000000-0000-0000-0000-000000000001",
      action: "usecase.analyze.failed",
      resourceType: "ai_usecase",
      resourceId: usecaseId,
      after: { reason, code, message: message.slice(0, 500) },
    }).catch(() => {});
    throw new Error(message);
  }
}

export function runAnalysisInBackground(args: AnalyzeArgs): void {
  runAnalysis(args).catch((err) => {
    console.error(`[inventory-analyze] uncaught in background:`, err);
  });
}
