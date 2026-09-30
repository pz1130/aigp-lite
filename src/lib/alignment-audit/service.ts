import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import type {
  AlignmentAudit,
  AlignmentResult,
  IncidentSeverity,
} from "@/lib/prisma";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { createIncident } from "@/lib/incidents/create";
import { DEFAULT_CONCERN_THRESHOLD, DEFAULT_WARN_THRESHOLD } from "./config";

type Db = OrgScopedClient;

export async function startAudit(
  db: Db,
  input: {
    orgId: string;
    usecaseId: string;
    targetProvider: string;
    targetModel: string;
    startedById: string;
  },
): Promise<{ id: string }> {
  const uc = await db.aiUsecase.findFirst({ where: { id: input.usecaseId } });
  if (!uc) throw new Error("usecase not found");

  const totalCount = await db.alignmentProbe.count({ where: { active: true } });

  const audit = await db.alignmentAudit.create({
    data: {
      orgId: input.orgId,
      usecaseId: input.usecaseId,
      targetProvider: input.targetProvider,
      targetModel: input.targetModel,
      status: "pending",
      totalCount,
      concernThreshold: DEFAULT_CONCERN_THRESHOLD,
      warnThreshold: DEFAULT_WARN_THRESHOLD,
      startedById: input.startedById,
    },
    select: { id: true },
  });

  await enqueueJob("alignment-audit.run", { auditId: audit.id });
  return { id: audit.id };
}

export async function listAudits(
  db: Db,
  filter: { usecaseId?: string; outcome?: string },
): Promise<AlignmentAudit[]> {
  return db.alignmentAudit.findMany({
    where: {
      ...(filter.usecaseId ? { usecaseId: filter.usecaseId } : {}),
      ...(filter.outcome ? { outcome: filter.outcome } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAuditWithResults(
  db: Db,
  id: string,
): Promise<{ audit: AlignmentAudit; results: AlignmentResult[] } | null> {
  const audit = await db.alignmentAudit.findFirst({ where: { id } });
  if (!audit) return null;
  const results = await db.alignmentResult.findMany({
    where: { auditId: id },
    orderBy: { dimension: "asc" },
  });
  return { audit, results };
}

export async function escalateAudit(
  db: Db,
  input: { id: string; orgId: string; userId: string },
): Promise<{ audit: AlignmentAudit; incidentId: string }> {
  const audit = await db.alignmentAudit.findFirst({ where: { id: input.id } });
  if (!audit) throw new Error("audit not found");
  if (audit.escalatedIncidentId) throw new Error("audit already escalated");
  if (audit.outcome !== "fail" && audit.outcome !== "concerns")
    throw new Error("only a failed or concerning audit can be escalated");

  const worst = await db.alignmentResult.findFirst({
    where: { auditId: audit.id },
    orderBy: { concernScore: "desc" },
  });
  const severity: IncidentSeverity =
    audit.outcome === "fail" ? "high" : "medium";

  const incident = await createIncident({
    orgId: input.orgId,
    title: `Alignment audit: ${audit.worstDimension ?? "concern"} on system`,
    severity,
    category: "capability_breach",
    openedById: input.userId,
    rootCause: worst
      ? `${worst.dimension} concern (score ${worst.concernScore}): ${worst.judgment}`
      : `Alignment audit outcome: ${audit.outcome}`,
    relatedUsecaseId: audit.usecaseId,
    externalRefs: {
      alignmentAuditId: audit.id,
      worstDimension: audit.worstDimension,
      source: "alignment_audit",
    },
    auditAction: "incident.opened_from_alignment_audit",
    auditAfter: { alignmentAuditId: audit.id, outcome: audit.outcome },
  });

  const updated = await db.alignmentAudit.update({
    where: { id: audit.id },
    data: { escalatedIncidentId: incident.id },
  });
  return { audit: updated, incidentId: incident.id };
}

export async function deleteAudit(db: Db, id: string): Promise<void> {
  const audit = await db.alignmentAudit.findFirst({ where: { id } });
  if (!audit) throw new Error("audit not found");
  await db.alignmentAudit.delete({ where: { id } });
}
