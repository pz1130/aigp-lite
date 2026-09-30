import { prisma } from "@/lib/db";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import type { ExternalReport } from "@/lib/prisma";
import type { IncidentCategory, IncidentSeverity } from "@/lib/prisma";
import { embedText } from "@/lib/incidents/embed";
import { cosineSimilarity } from "@/lib/incidents/cosine";
import { createIncident } from "@/lib/incidents/create";
import { assertTransition, TERMINAL } from "./transitions";
import { generatePublicToken } from "./token";
import { hashIp } from "./anti-abuse";
import { notifyExternalReportReceived } from "./notify";

type Db = OrgScopedClient;

export interface ResolvedUsecase {
  id: string;
  orgId: string;
  name: string;
}

/** Public lookup: only resolves when intake is explicitly enabled. Uses base prisma. */
export async function resolveUsecaseByToken(
  token: string,
): Promise<ResolvedUsecase | null> {
  if (!token) return null;
  const uc = await prisma.aiUsecase.findFirst({
    where: { publicReportToken: token, publicReportEnabled: true },
    select: { id: true, orgId: true, name: true },
  });
  return uc ?? null;
}

export interface CreateReportInput {
  usecase: ResolvedUsecase;
  data: {
    type: string;
    title: string;
    description: string;
    reproSteps: string;
    reporterEmail?: string;
  };
  ip: string | null | undefined;
  userAgent: string | null | undefined;
}

/** Persist a received report + best-effort embedding, then fan out. Uses base prisma. */
export async function createExternalReport(
  input: CreateReportInput,
): Promise<{ id: string }> {
  const { usecase, data } = input;
  const embedding = await embedText(
    usecase.orgId,
    `${data.title}\n${data.description}`,
  ).catch(() => null);

  const report = await prisma.externalReport.create({
    data: {
      orgId: usecase.orgId,
      usecaseId: usecase.id,
      type: data.type,
      status: "received",
      title: data.title,
      description: data.description,
      reproSteps: data.reproSteps,
      reporterEmail: data.reporterEmail ?? null,
      reporterMeta: {
        ipHash: hashIp(input.ip),
        userAgent: input.userAgent ?? "",
        submittedAt: new Date().toISOString(),
      },
      embedding: embedding ?? undefined,
    },
    select: { id: true, title: true, type: true },
  });

  await notifyExternalReportReceived(usecase.orgId, report);
  return { id: report.id };
}

export async function listReports(
  db: Db,
  filter: { type?: string; status?: string },
): Promise<ExternalReport[]> {
  return db.externalReport.findMany({
    where: {
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export interface SimilarHit {
  kind: "incident" | "report";
  id: string;
  title: string;
  similarity: number;
}

/** Detail + embedding-based similar open incidents/reports in the same org. */
export async function getReportWithSimilar(
  db: Db,
  orgId: string,
  id: string,
): Promise<{ report: ExternalReport; similar: SimilarHit[] } | null> {
  const report = await db.externalReport.findFirst({ where: { id } });
  if (!report) return null;

  const vec = report.embedding as number[] | null;
  if (!vec || vec.length === 0) return { report, similar: [] };

  const [incidents, reports] = await Promise.all([
    db.incident.findMany({
      where: { orgId, status: { not: "closed" } },
      select: { id: true, title: true, embedding: true },
      take: 200,
    }),
    db.externalReport.findMany({
      where: { id: { not: id } },
      select: { id: true, title: true, embedding: true },
      take: 200,
    }),
  ]);

  const hits: SimilarHit[] = [];
  for (const inc of incidents) {
    const iv = inc.embedding as number[] | null;
    if (iv && iv.length === vec.length) {
      const s = cosineSimilarity(vec, iv);
      if (s >= 0.75)
        hits.push({
          kind: "incident",
          id: inc.id,
          title: inc.title,
          similarity: s,
        });
    }
  }
  for (const r of reports) {
    const rv = r.embedding as number[] | null;
    if (rv && rv.length === vec.length) {
      const s = cosineSimilarity(vec, rv);
      if (s >= 0.75)
        hits.push({ kind: "report", id: r.id, title: r.title, similarity: s });
    }
  }
  hits.sort((a, b) => b.similarity - a.similarity);
  return { report, similar: hits.slice(0, 5) };
}

export async function transitionReport(
  db: Db,
  input: {
    id: string;
    orgId: string;
    status: string;
    userId: string;
    triageNotes?: string;
    citedProhibitedUseClause?: string;
  },
): Promise<ExternalReport> {
  const current = await db.externalReport.findFirst({
    where: { id: input.id },
  });
  if (!current) throw new Error("external report not found");
  assertTransition(current.status, input.status);

  const terminal = TERMINAL.has(input.status);
  return db.externalReport.update({
    where: { id: input.id },
    data: {
      status: input.status,
      ...(input.triageNotes !== undefined
        ? { triageNotes: input.triageNotes }
        : {}),
      ...(input.citedProhibitedUseClause !== undefined
        ? { citedProhibitedUseClause: input.citedProhibitedUseClause }
        : {}),
      ...(terminal
        ? { resolvedById: input.userId, resolvedAt: new Date() }
        : {}),
    },
  });
}

const ESCALATION: Record<
  string,
  { category: IncidentCategory; severity: IncidentSeverity }
> = {
  vulnerability: { category: "capability_breach", severity: "high" },
  usage_violation: { category: "policy_bypass", severity: "medium" },
};

export async function escalateReport(
  db: Db,
  input: { id: string; orgId: string; userId: string },
): Promise<{ report: ExternalReport; incidentId: string }> {
  const report = await db.externalReport.findFirst({ where: { id: input.id } });
  if (!report) throw new Error("external report not found");
  if (report.escalatedIncidentId) throw new Error("report already escalated");
  if (TERMINAL.has(report.status))
    throw new Error("cannot escalate a resolved report");

  const map = ESCALATION[report.type] ?? {
    category: "policy_bypass" as IncidentCategory,
    severity: "medium" as IncidentSeverity,
  };
  const rootCause =
    report.type === "usage_violation" && report.citedProhibitedUseClause
      ? `${report.description}\n\nCited prohibited-use clause: ${report.citedProhibitedUseClause}`
      : report.description;

  const incident = await createIncident({
    orgId: input.orgId,
    title: `External report: ${report.title}`,
    severity: map.severity,
    category: map.category,
    openedById: input.userId,
    rootCause,
    relatedUsecaseId: report.usecaseId,
    externalRefs: {
      externalReportId: report.id,
      reporterEmail: report.reporterEmail ?? null,
      source: "external_report",
    },
    auditAction: "incident.opened_from_external_report",
    auditAfter: { externalReportId: report.id, type: report.type },
  });

  const updated = await db.externalReport.update({
    where: { id: report.id },
    data: { status: "accepted", escalatedIncidentId: incident.id },
  });
  return { report: updated, incidentId: incident.id };
}

export async function setPublicIntake(
  db: Db,
  input: {
    usecaseId: string;
    orgId: string;
    enabled: boolean;
    rotate?: boolean;
  },
): Promise<{ token: string | null; enabled: boolean }> {
  const uc = await db.aiUsecase.findFirst({
    where: { id: input.usecaseId },
    select: { publicReportToken: true },
  });
  if (!uc) throw new Error("usecase not found");

  let token = uc.publicReportToken;
  if (input.enabled && (!token || input.rotate)) token = generatePublicToken();
  if (!input.enabled) token = null;

  await db.aiUsecase.update({
    where: { id: input.usecaseId },
    data: { publicReportEnabled: input.enabled, publicReportToken: token },
  });
  return { token, enabled: input.enabled };
}
