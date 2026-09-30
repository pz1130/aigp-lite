import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import {
  flattenThresholds,
  getCatalog,
} from "@/lib/frontier-risk-tier/catalog";
import { deriveEffectiveTier } from "@/lib/frontier-risk-tier/effective-tier";
import { ALIGNMENT_AUDIT_MAX_AGE_DAYS } from "@/lib/alignment-audit/config";
import { formatModelRef } from "./approval-fingerprint";
import type { DossierSnapshot, GoLiveCurrent } from "./types";

export async function buildDossierSnapshot(
  db: OrgScopedClient,
  orgId: string,
  usecaseId: string,
): Promise<DossierSnapshot | null> {
  const u = await db.aiUsecase.findFirst({
    where: { id: usecaseId, orgId },
    include: {
      classification: true,
      owner: { select: { name: true } },
    },
  });
  if (!u) return null;

  // `humanOversightAttestedBy` is a scalar FK only (no Prisma relation on
  // AiUsecase), so resolve the attester's name with a separate lookup.
  const oversightAttester = u.humanOversightAttestedById
    ? await db.user.findUnique({
        where: { id: u.humanOversightAttestedById },
        select: { name: true },
      })
    : null;

  const deprecatedByUser = u.deprecatedById
    ? await db.user.findUnique({
        where: { id: u.deprecatedById },
        select: { name: true },
      })
    : null;

  const cat = u.classification?.euAiActCategory ?? null;
  const isHighRisk = cat === "high" || cat === "prohibited";
  const containsPii = u.classification?.containsPii ?? false;

  const [
    latestAssessment,
    controlsNotSatisfied,
    catalogTotal,
    catalogWithoutRationale,
    dataSourceCount,
    versionCount,
    invocationCount,
    approvedFria,
    publishedTxr,
    completedRedteam,
    attestationCount,
    benchmarkCount,
    completedRunCount,
    openHighCrit,
    goLiveRow,
    approvedFrt,
    frtCatalog,
    latestModelVersion,
    latestAlignmentAudit,
  ] = await Promise.all([
    db.usecaseRiskAssessment.findFirst({
      where: { orgId, usecaseId },
      orderBy: { assessedAt: "desc" },
    }),
    db.usecaseControlStatus.count({
      where: {
        orgId,
        usecaseId,
        status: { notIn: ["satisfied", "not_applicable"] },
      },
    }),
    db.usecaseCatalogRiskLink.count({ where: { orgId, usecaseId } }),
    db.usecaseCatalogRiskLink.count({
      where: { orgId, usecaseId, rationale: "" },
    }),
    db.usecaseDataLink.count({ where: { usecaseId } }),
    db.aiModelVersion.count({ where: { usecaseId } }),
    db.llmInvocation.count({ where: { usecaseId } }),
    db.usecaseFria.count({ where: { orgId, usecaseId, status: "approved" } }),
    db.txrReport.count({ where: { orgId, usecaseId, status: "published" } }),
    db.evaluation.count({ where: { orgId, usecaseId, status: "completed" } }),
    db.redteamAttestation.count({ where: { orgId, usecaseId } }),
    db.driftBenchmark.count({ where: { orgId, usecaseId } }),
    db.driftRun.count({
      where: { orgId, status: "completed", benchmark: { usecaseId } },
    }),
    db.incident.count({
      where: {
        orgId,
        relatedUsecaseId: usecaseId,
        status: { in: ["open", "investigating"] },
        severity: { in: ["high", "critical"] },
      },
    }),
    db.goLiveReview.findFirst({
      where: { orgId, usecaseId, supersededById: null },
      orderBy: { createdAt: "desc" },
      include: { decidedBy: { select: { name: true } } },
    }),
    db.frtAssessment.findFirst({
      where: {
        orgId,
        usecaseId,
        status: "approved",
        supersededById: null,
      },
      orderBy: { version: "desc" },
      include: { answers: true },
    }),
    getCatalog(),
    db.aiModelVersion.findFirst({
      where: { usecaseId },
      orderBy: { createdAt: "desc" },
      select: { version: true },
    }),
    db.alignmentAudit.findFirst({
      where: { orgId, usecaseId, status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { outcome: true, completedAt: true },
    }),
  ]);

  const alignmentStatus: DossierSnapshot["alignmentAudit"]["status"] = (() => {
    if (!latestAlignmentAudit || !latestAlignmentAudit.completedAt)
      return "missing";
    const ageMs = Date.now() - latestAlignmentAudit.completedAt.getTime();
    const maxMs = ALIGNMENT_AUDIT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > maxMs) return "stale";
    const o = latestAlignmentAudit.outcome;
    if (o === "fail") return "fail";
    if (o === "concerns") return "concerns";
    return "pass";
  })();

  const tierByCode = new Map(
    flattenThresholds(frtCatalog).map((t) => [t.code, t.tier]),
  );
  const derivedCapability = deriveEffectiveTier(
    approvedFrt
      ? approvedFrt.answers.map((a) => ({
          status: a.status,
          tier: tierByCode.get(a.thresholdCode) ?? 0,
        }))
      : null,
  );
  const capability = {
    assessed: derivedCapability.assessed,
    effectiveTier: derivedCapability.tier,
  };

  const goLive: GoLiveCurrent | null = goLiveRow
    ? {
        id: goLiveRow.id,
        status: goLiveRow.status,
        rationale: goLiveRow.rationale,
        conditions: goLiveRow.conditions,
        decidedById: goLiveRow.decidedById,
        decidedByName: goLiveRow.decidedBy?.name ?? null,
        decidedAt: goLiveRow.decidedAt,
        boundTier: goLiveRow.boundTier,
        boundModelRef: goLiveRow.boundModelRef,
        staleApproval: goLiveRow.staleApproval,
      }
    : null;

  return {
    system: {
      id: u.id,
      name: u.name,
      ownerId: u.ownerId,
      ownerName: u.owner?.name ?? null,
      lifecycleStage: u.lifecycleStage,
      autonomyLevel: u.autonomyLevel,
      deploymentType: u.deploymentType,
      description: u.description,
      modelCardMd: u.modelCardMd,
      intendedUseMd: u.intendedUseMd,
      prohibitedUseMd: u.prohibitedUseMd,
      humanOversightAttested: u.humanOversightAttested,
      humanOversightAttestedByName: oversightAttester?.name ?? null,
      humanOversightAttestedAt: u.humanOversightAttestedAt,
      updatedAt: u.updatedAt,
      sunsetDate: u.sunsetDate,
      deprecatedAt: u.deprecatedAt,
      deprecatedByName: deprecatedByUser?.name ?? null,
      deprecationReason: u.deprecationReason,
    },
    classification: {
      present: !!u.classification,
      euAiActCategory: cat,
      isHighRisk,
      containsPii,
      dataSensitivity: u.classification?.dataSensitivity ?? null,
    },
    risk: { hasAssessment: !!latestAssessment, controlsNotSatisfied },
    regulatoryRisks: {
      total: catalogTotal,
      withoutRationale: catalogWithoutRationale,
    },
    dataGovernance: { dataSourceCount },
    documentation: {
      hasModelCard: u.modelCardMd.trim().length > 0,
      versionCount,
    },
    logging: { invocationCount },
    fria: { approvedCount: approvedFria },
    transparency: { publishedCount: publishedTxr },
    redteam: { completedCount: completedRedteam },
    externalRedteam: { attestationCount },
    drift: { benchmarkCount, completedRunCount },
    alignmentAudit: { status: alignmentStatus },
    incidents: { openHighOrCritical: openHighCrit },
    capability,
    modelRef: formatModelRef(latestModelVersion?.version),
    goLive,
  };
}
