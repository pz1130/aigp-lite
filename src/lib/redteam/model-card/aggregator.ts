import { prisma } from "@/lib/db";

export interface ModelCardData {
  usecase: {
    id: string;
    name: string;
    lifecycleStage: string;
    autonomyLevel: string;
    deploymentType: string;
    description: string;
  };
  inventory: {
    ownerName?: string;
    ownerEmail?: string;
  };
  risk: {
    topRisks: Array<{
      id: string;
      title: string;
      severity: string;
      assessedAt: Date;
    }>;
  };
  evaluations: Array<{
    id: string;
    createdAt: Date;
    model: string;
    totalPrompts: number;
    passedCount: number;
    failedCount: number;
    errorCount: number;
  }>;
  knownLimitations: string;
  generatedAt: Date;
  generatedBy: { id: string; name: string };
}

export interface AggregateModelCardOpts {
  orgId: string;
  usecaseId: string;
  generatedBy: { id: string; name: string };
}

export async function aggregateModelCard(
  opts: AggregateModelCardOpts,
): Promise<ModelCardData> {
  const uc = await prisma.aiUsecase.findFirstOrThrow({
    where: { id: opts.usecaseId, orgId: opts.orgId },
    include: { owner: { select: { name: true, email: true } } },
  });

  const risks = await prisma.usecaseRiskAssessment.findMany({
    where: { orgId: opts.orgId, usecaseId: opts.usecaseId },
    take: 5,
    orderBy: { assessedAt: "desc" },
  });

  const evaluations = await prisma.evaluation.findMany({
    where: { orgId: opts.orgId },
    take: 3,
    orderBy: { createdAt: "desc" },
  });

  return {
    usecase: {
      id: uc.id,
      name: uc.name,
      lifecycleStage: uc.lifecycleStage,
      autonomyLevel: uc.autonomyLevel,
      deploymentType: uc.deploymentType,
      description: uc.description,
    },
    inventory: {
      ownerName: uc.owner?.name ?? undefined,
      ownerEmail: uc.owner?.email ?? undefined,
    },
    risk: {
      topRisks: risks.map((r) => ({
        id: r.id,
        title: r.notes || `Score ${r.scoreInt}`,
        severity: r.level,
        assessedAt: r.assessedAt,
      })),
    },
    evaluations: evaluations.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      model: e.model,
      totalPrompts: e.totalPrompts,
      passedCount: e.passedCount,
      failedCount: e.failedCount,
      errorCount: e.errorCount,
    })),
    knownLimitations: uc.modelCardMd || "No known limitations documented.",
    generatedAt: new Date(),
    generatedBy: opts.generatedBy,
  };
}
