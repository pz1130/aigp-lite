import { prisma } from "@/lib/db";
import type {
  AiUsecase,
  Incident,
  Policy,
  PolicyEvaluation,
} from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";
import { writeAudit } from "@/lib/audit/log";
import { classify, type Trigger } from "./classify";
import { getOrgAutomationConfig } from "./automation-config";
import { count } from "@/lib/observability/metrics";
import { createIncident } from "./create";

export type EvaluationWithRelations = PolicyEvaluation & {
  policy: Policy;
  usecase?: AiUsecase | null;
  usecaseId?: string | null;
};

export async function maybeOpenIncident(
  evaluation: EvaluationWithRelations,
): Promise<Incident | null> {
  const cfg = await getOrgAutomationConfig(evaluation.orgId);
  if (!cfg.autoOpenEnabled) return null;
  if (!evaluation.hit) return null;

  const trigger = await decideTrigger(evaluation, cfg);
  if (!trigger) return null;

  if (cfg.dedupEnabled) {
    const existing = await findOpenIncidentForSamePolicyUsecase(
      evaluation.orgId,
      evaluation.policyId,
      evaluation.usecaseId ?? null,
      24 * 60,
    );
    if (existing) {
      await attachEvaluation(existing.id, evaluation, trigger);
      return existing;
    }
  }

  const { category, severity } = classify(evaluation.policy, trigger);
  const title = `Auto: ${evaluation.policy.name} hit on ${evaluation.usecase?.name ?? "unknown usecase"}`;

  const incident = await createIncident({
    orgId: evaluation.orgId,
    title,
    severity,
    category,
    openedById: SYSTEM_USER_ID,
    relatedUsecaseId: evaluation.usecaseId ?? null,
    relatedPolicyEvaluationId: evaluation.id,
    autoCreatedFromPolicyEvalId: evaluation.id,
    auditAction: "incident.auto_opened",
    auditAfter: {
      trigger,
      category,
      severity,
      policyId: evaluation.policyId,
      evaluationId: evaluation.id,
    },
  });

  count("incident.auto_opened", { trigger, category });
  return incident;
}

/**
 * Job entrypoint: load the evaluation (+ its policy) by id and run
 * maybeOpenIncident. Carries only ids across the queue boundary.
 */
export async function maybeOpenIncidentByEvaluationId(
  evaluationId: string,
  usecaseId: string | null,
): Promise<Incident | null> {
  const evalWithRel = await prisma.policyEvaluation.findUnique({
    where: { id: evaluationId },
    include: { policy: true },
  });
  if (!evalWithRel) return null;
  return maybeOpenIncident({ ...evalWithRel, usecase: null, usecaseId });
}

async function decideTrigger(
  e: EvaluationWithRelations,
  cfg: {
    blockAlwaysOpens: boolean;
    hitBurstThreshold: number;
    hitBurstWindowMin: number;
  },
): Promise<Trigger | null> {
  if (e.policy.enforcementMode === "block" && cfg.blockAlwaysOpens)
    return "block";

  const since = new Date(Date.now() - cfg.hitBurstWindowMin * 60 * 1000);
  const hits = await prisma.policyEvaluation.count({
    where: {
      orgId: e.orgId,
      policyId: e.policyId,
      hit: true,
      ts: { gte: since },
    },
  });
  if (hits >= cfg.hitBurstThreshold) {
    const recent = await prisma.incident.findFirst({
      where: {
        orgId: e.orgId,
        autoCreatedFromPolicyEvalId: { not: null },
        relatedUsecaseId: e.usecaseId ?? null,
        openedAt: { gte: since },
      },
      orderBy: { openedAt: "desc" },
    });
    if (recent) return null;
    return "burst";
  }
  return null;
}

async function findOpenIncidentForSamePolicyUsecase(
  orgId: string,
  policyId: string,
  usecaseId: string | null,
  windowMinutes: number,
): Promise<Incident | null> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  return prisma.incident.findFirst({
    where: {
      orgId,
      relatedUsecaseId: usecaseId,
      status: { not: "closed" },
      mergedIntoId: null,
      openedAt: { gte: since },
      policyEvaluation: { policyId },
    },
    orderBy: { openedAt: "desc" },
  });
}

async function attachEvaluation(
  incidentId: string,
  evaluation: EvaluationWithRelations,
  trigger: Trigger,
): Promise<void> {
  await writeAudit({
    orgId: evaluation.orgId,
    actorId: SYSTEM_USER_ID,
    action: "incident.evaluation_attached",
    resourceType: "incident",
    resourceId: incidentId,
    after: {
      evaluationId: evaluation.id,
      policyId: evaluation.policyId,
      trigger,
    },
  });
  count("incident.dedup.attached", { trigger });
}
