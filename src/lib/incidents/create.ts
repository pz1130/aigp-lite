import { prisma } from "@/lib/db";
import type {
  Incident,
  IncidentCategory,
  IncidentSeverity,
  Prisma,
} from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { count } from "@/lib/observability/metrics";
import { enqueueJob } from "@/lib/jobs/enqueue";

export interface CreateIncidentInput {
  orgId: string;
  title: string;
  severity: IncidentSeverity;
  category: IncidentCategory | null;
  openedById: string;
  rootCause?: string;
  relatedUsecaseId?: string | null;
  relatedPolicyEvaluationId?: string | null;
  autoCreatedFromPolicyEvalId?: string | null;
  externalRefs?: Record<string, unknown>;
  auditAction?: string;
  auditAfter?: Record<string, unknown>;
}

/** Shared incident-creation core: create row, emit metric + audit, enqueue dedup. */
export async function createIncident(
  input: CreateIncidentInput,
): Promise<Incident> {
  const incident = await prisma.incident.create({
    data: {
      orgId: input.orgId,
      title: input.title,
      severity: input.severity,
      status: "open",
      category: input.category,
      rootCause: input.rootCause ?? "",
      relatedUsecaseId: input.relatedUsecaseId ?? null,
      relatedPolicyEvaluationId: input.relatedPolicyEvaluationId ?? null,
      autoCreatedFromPolicyEvalId: input.autoCreatedFromPolicyEvalId ?? null,
      externalRefs: (input.externalRefs ?? {}) as Prisma.InputJsonValue,
      openedById: input.openedById,
    },
  });

  count("incident.opened", {
    category: input.category ?? "none",
    severity: input.severity,
  });

  await writeAudit({
    orgId: input.orgId,
    actorId: input.openedById,
    action: input.auditAction ?? "incident.opened",
    resourceType: "incident",
    resourceId: incident.id,
    after: input.auditAfter ?? {
      category: input.category,
      severity: input.severity,
    },
  });

  await enqueueJob("incident.suggest-duplicates", { incidentId: incident.id });
  return incident;
}
