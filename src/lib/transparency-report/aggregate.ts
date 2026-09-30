import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { buildOrgSnapshot, type TxrOrgSnapshot } from "./org-aggregate";
import { getCatalog } from "@/lib/frontier-risk-tier/catalog";
import {
  scoreCategory,
  type AnswerLite,
} from "@/lib/frontier-risk-tier/scoring";
import { computePosture } from "@/lib/governance/posture";

export interface TxrFrtBlock {
  found: boolean;
  assessmentId: string | null;
  version: number | null;
  overallTier: number;
  byCategory: {
    code: string;
    title: string;
    assignedTier: number;
    completionPct: number;
  }[];
}

export interface TxrTierDeltas {
  priorEdition: { version: number; periodLabel: string } | null;
  overall: { from: number; to: number };
  byCategory: {
    code: string;
    from: number;
    to: number;
    direction: "up" | "down" | "same" | "new";
  }[];
}

export interface TxrIncidentBlock {
  periodStart: string;
  periodEnd: string;
  total: number;
  bySeverity: { low: number; medium: number; high: number; critical: number };
  byCategory: Record<string, number>;
}

export interface TxrDriftBlock {
  latestRun: {
    id: string;
    avgScore: number | null;
    degraded: boolean;
    completedAt: string | null;
  } | null;
  runsInPeriod: number;
  degradedRunsInPeriod: number;
}

export interface TxrSnapshot {
  frt: TxrFrtBlock;
  tierDeltas: TxrTierDeltas;
  incidents: TxrIncidentBlock;
  drift: TxrDriftBlock;
  posture: { score: number };
  generatedAt: string;
}

export function computeTierDeltas(
  currentFrt: TxrFrtBlock,
  priorFrt: TxrFrtBlock | null,
  priorEdition: { version: number; periodLabel: string } | null,
): TxrTierDeltas {
  const priorByCode = new Map<string, number>(
    (priorFrt?.byCategory ?? []).map((c) => [c.code, c.assignedTier]),
  );
  const byCategory = currentFrt.byCategory.map((c) => {
    const had = priorByCode.has(c.code);
    const from = priorByCode.get(c.code) ?? 0;
    const to = c.assignedTier;
    let direction: "up" | "down" | "same" | "new";
    if (!had) direction = "new";
    else if (to > from) direction = "up";
    else if (to < from) direction = "down";
    else direction = "same";
    return { code: c.code, from, to, direction };
  });
  return {
    priorEdition,
    overall: { from: priorFrt?.overallTier ?? 0, to: currentFrt.overallTier },
    byCategory,
  };
}

export async function aggregateFrtTiers(
  db: OrgScopedClient,
  orgId: string,
  usecaseId: string | null,
): Promise<TxrFrtBlock> {
  const catalog = await getCatalog();
  const a = await db.frtAssessment.findFirst({
    where: { orgId, usecaseId, status: "approved" },
    orderBy: { version: "desc" },
    include: { answers: { select: { thresholdCode: true, status: true } } },
  });
  if (!a) {
    return {
      found: false,
      assessmentId: null,
      version: null,
      overallTier: 0,
      byCategory: catalog.map((c) => ({
        code: c.code,
        title: c.title,
        assignedTier: 0,
        completionPct: 0,
      })),
    };
  }
  const byCode = new Map(
    a.answers.map((x) => [x.thresholdCode, x.status as AnswerLite["status"]]),
  );
  const byCategory = catalog.map((c) => {
    const ans: AnswerLite[] = c.thresholds.map((th) => ({
      tier: th.tier,
      status: byCode.get(th.code) ?? "unanswered",
    }));
    const sc = scoreCategory(c.code, ans);
    return {
      code: c.code,
      title: c.title,
      assignedTier: sc.assignedTier,
      completionPct: sc.completionPct,
    };
  });
  const overallTier = byCategory.reduce(
    (m, b) => Math.max(m, b.assignedTier),
    0,
  );
  return {
    found: true,
    assessmentId: a.id,
    version: a.version,
    overallTier,
    byCategory,
  };
}

export async function aggregateIncidents(
  db: OrgScopedClient,
  orgId: string,
  usecaseId: string | null,
  periodStart: Date,
  periodEnd: Date,
): Promise<TxrIncidentBlock> {
  const rows = await db.incident.findMany({
    where: {
      orgId,
      openedAt: { gte: periodStart, lte: periodEnd },
      ...(usecaseId ? { relatedUsecaseId: usecaseId } : {}),
    },
    select: { severity: true, category: true },
  });
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    bySeverity[r.severity] += 1;
    const key = r.category ?? "uncategorized";
    byCategory[key] = (byCategory[key] ?? 0) + 1;
  }
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    total: rows.length,
    bySeverity,
    byCategory,
  };
}

export async function aggregateDrift(
  db: OrgScopedClient,
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<TxrDriftBlock> {
  const latest = await db.driftRun.findFirst({
    where: { orgId, status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, avgScore: true, degraded: true, completedAt: true },
  });
  const inPeriod = await db.driftRun.findMany({
    where: { orgId, startedAt: { gte: periodStart, lte: periodEnd } },
    select: { degraded: true },
  });
  return {
    latestRun: latest
      ? {
          id: latest.id,
          avgScore: latest.avgScore,
          degraded: latest.degraded,
          completedAt: latest.completedAt?.toISOString() ?? null,
        }
      : null,
    runsInPeriod: inPeriod.length,
    degradedRunsInPeriod: inPeriod.filter((r) => r.degraded).length,
  };
}

export async function aggregatePosture(
  db: OrgScopedClient,
  orgId: string,
): Promise<{ score: number }> {
  const p = await computePosture(db, orgId);
  return { score: p.score };
}

export async function buildSnapshot(
  db: OrgScopedClient,
  params: {
    orgId: string;
    usecaseId: string | null;
    periodStart: Date;
    periodEnd: Date;
  },
  prior: {
    report: { version: number; periodLabel: string };
    snapshot: TxrSnapshot;
  } | null,
): Promise<TxrSnapshot> {
  const frt = await aggregateFrtTiers(db, params.orgId, params.usecaseId);
  const tierDeltas = computeTierDeltas(
    frt,
    prior?.snapshot.frt ?? null,
    prior
      ? { version: prior.report.version, periodLabel: prior.report.periodLabel }
      : null,
  );
  const incidents = await aggregateIncidents(
    db,
    params.orgId,
    params.usecaseId,
    params.periodStart,
    params.periodEnd,
  );
  const drift = await aggregateDrift(
    db,
    params.orgId,
    params.periodStart,
    params.periodEnd,
  );
  const posture = await aggregatePosture(db, params.orgId);
  return {
    frt,
    tierDeltas,
    incidents,
    drift,
    posture,
    generatedAt: new Date().toISOString(),
  };
}

export async function resolveAggregation(
  db: OrgScopedClient,
  report: {
    orgId: string;
    usecaseId: string | null;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    snapshot: unknown;
  },
): Promise<TxrSnapshot | TxrOrgSnapshot> {
  if (report.status === "published" && report.snapshot) {
    return report.snapshot as TxrSnapshot | TxrOrgSnapshot;
  }

  if (report.usecaseId === null) {
    const priorOrg = await db.txrReport.findFirst({
      where: { orgId: report.orgId, usecaseId: null, status: "published" },
      orderBy: { version: "desc" },
      select: { version: true, periodLabel: true, snapshot: true },
    });
    const priorSnap =
      priorOrg?.snapshot && "portfolio" in (priorOrg.snapshot as object)
        ? (priorOrg.snapshot as unknown as TxrOrgSnapshot)
        : null;
    return buildOrgSnapshot(
      db,
      {
        orgId: report.orgId,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
      },
      priorSnap && priorOrg
        ? {
            report: {
              version: priorOrg.version,
              periodLabel: priorOrg.periodLabel,
            },
            snapshot: priorSnap,
          }
        : null,
    );
  }

  const prior = await db.txrReport.findFirst({
    where: {
      orgId: report.orgId,
      usecaseId: report.usecaseId,
      status: "published",
    },
    orderBy: { version: "desc" },
    select: { version: true, periodLabel: true, snapshot: true },
  });
  return buildSnapshot(
    db,
    {
      orgId: report.orgId,
      usecaseId: report.usecaseId,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
    },
    prior?.snapshot
      ? {
          report: { version: prior.version, periodLabel: prior.periodLabel },
          snapshot: prior.snapshot as unknown as TxrSnapshot,
        }
      : null,
  );
}
