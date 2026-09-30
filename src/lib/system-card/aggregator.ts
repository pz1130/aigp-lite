import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { buildDossierSnapshot } from "@/lib/dossier/aggregate";
import { evaluateReadiness } from "@/lib/dossier/readiness";
import type { DossierSnapshot, ReadinessEvaluation } from "@/lib/dossier/types";

export interface SystemCardData {
  snapshot: DossierSnapshot;
  readiness: ReadinessEvaluation;
  latestAssessment: {
    level: string;
    scoreInt: number;
    assessedAt: Date;
    notes: string;
  } | null;
  evaluations: {
    id: string;
    createdAt: Date;
    model: string;
    totalPrompts: number;
    passedCount: number;
    failedCount: number;
    errorCount: number;
  }[];
  externalAttestations: {
    id: string;
    attesterName: string;
    attesterOrg: string;
    scope: string;
    attestedAt: Date;
    engagementStart: Date | null;
    engagementEnd: Date | null;
    reportSha256: string;
    summary: string;
  }[];
  driftBenchmarks: {
    id: string;
    name: string;
    threshold: number;
    latestRun: {
      avgScore: number | null;
      degraded: boolean;
      completedAt: Date | null;
    } | null;
  }[];
  friaRecords: {
    id: string;
    title: string;
    version: number;
    status: string;
    updatedAt: Date;
  }[];
  transparencyReports: {
    id: string;
    title: string;
    version: number;
    publishedAt: Date | null;
  }[];
  openIncidents: {
    id: string;
    title: string;
    severity: string;
    openedAt: Date;
  }[];
  knownLimitations: string;
  intendedUse: string;
  prohibitedUse: string;
  generatedAt: Date;
  generatedBy: { id: string; name: string };
}

export async function aggregateSystemCard(opts: {
  db: OrgScopedClient;
  orgId: string;
  usecaseId: string;
  generatedBy: { id: string; name: string };
}): Promise<SystemCardData | null> {
  const { db, orgId, usecaseId } = opts;

  const snapshot = await buildDossierSnapshot(db, orgId, usecaseId);
  if (!snapshot) return null;
  const readiness = evaluateReadiness(snapshot);

  const [
    assessment,
    evaluations,
    benchmarks,
    frias,
    txrs,
    incidents,
    attestations,
  ] = await Promise.all([
    db.usecaseRiskAssessment.findFirst({
      where: { orgId, usecaseId },
      orderBy: { assessedAt: "desc" },
    }),
    db.evaluation.findMany({
      where: { orgId, usecaseId, status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.driftBenchmark.findMany({
      where: { orgId, usecaseId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        runs: {
          where: { status: "completed" },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    }),
    db.usecaseFria.findMany({
      where: { orgId, usecaseId },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.txrReport.findMany({
      where: { orgId, usecaseId, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    db.incident.findMany({
      where: {
        orgId,
        relatedUsecaseId: usecaseId,
        status: { in: ["open", "investigating"] },
        severity: { in: ["high", "critical"] },
      },
      orderBy: { openedAt: "desc" },
      take: 5,
    }),
    db.redteamAttestation.findMany({
      where: { orgId, usecaseId },
      orderBy: { attestedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    snapshot,
    readiness,
    latestAssessment: assessment
      ? {
          level: assessment.level,
          scoreInt: assessment.scoreInt,
          assessedAt: assessment.assessedAt,
          notes: assessment.notes,
        }
      : null,
    evaluations: evaluations.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      model: e.model,
      totalPrompts: e.totalPrompts,
      passedCount: e.passedCount,
      failedCount: e.failedCount,
      errorCount: e.errorCount,
    })),
    externalAttestations: attestations.map((a) => ({
      id: a.id,
      attesterName: a.attesterName,
      attesterOrg: a.attesterOrg,
      scope: a.scope,
      attestedAt: a.attestedAt,
      engagementStart: a.engagementStart,
      engagementEnd: a.engagementEnd,
      reportSha256: a.reportSha256,
      summary: a.summary,
    })),
    driftBenchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.name,
      threshold: b.threshold,
      latestRun: b.runs[0]
        ? {
            avgScore: b.runs[0].avgScore,
            degraded: b.runs[0].degraded,
            completedAt: b.runs[0].completedAt,
          }
        : null,
    })),
    friaRecords: frias.map((f) => ({
      id: f.id,
      title: f.title,
      version: f.version,
      status: f.status,
      updatedAt: f.updatedAt,
    })),
    transparencyReports: txrs.map((r) => ({
      id: r.id,
      title: r.title,
      version: r.version,
      publishedAt: r.publishedAt,
    })),
    openIncidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      openedAt: i.openedAt,
    })),
    knownLimitations:
      snapshot.system.modelCardMd.trim() || "No known limitations documented.",
    intendedUse:
      snapshot.system.intendedUseMd.trim() ||
      "No intended use statement documented.",
    prohibitedUse:
      snapshot.system.prohibitedUseMd.trim() ||
      "No prohibited-use statement documented.",
    generatedAt: new Date(),
    generatedBy: opts.generatedBy,
  };
}

export function systemCardFilename(
  systemName: string,
  ext: "md" | "pdf",
  generatedAt: Date,
): string {
  const slug =
    systemName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "system";
  return `system-card-${slug}-${generatedAt.toISOString().slice(0, 10)}.${ext}`;
}
