import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { buildDossierSnapshot } from "@/lib/dossier/aggregate";
import { evaluateReadiness } from "@/lib/dossier/readiness";
import type { GoLiveState } from "@/lib/dossier/types";
import type { TxrDriftBlock } from "./aggregate";
import {
  aggregateFrtTiers,
  aggregateIncidents,
  aggregateDrift,
  aggregatePosture,
} from "./aggregate";

export interface TxrOrgSnapshot {
  portfolio: {
    usecaseId: string;
    name: string;
    ownerName: string | null;
    isHighRisk: boolean;
    euAiActCategory: string | null;
    frtTier: number;
    readinessState: GoLiveState;
    blockingCheckIds: string[];
    incidents: {
      total: number;
      bySeverity: {
        low: number;
        medium: number;
        high: number;
        critical: number;
      };
    };
  }[];
  totals: {
    systemCount: number;
    byReadiness: {
      ready: number;
      conditionally_ready: number;
      not_ready: number;
      live: number;
    };
    highRiskBlocked: number;
    worstTier: number;
    tierDistribution: Record<"0" | "1" | "2" | "3", number>;
    incidents: {
      total: number;
      bySeverity: {
        low: number;
        medium: number;
        high: number;
        critical: number;
      };
      byCategory: Record<string, number>;
    };
  };
  drift: TxrDriftBlock;
  posture: { score: number };
  deltas: {
    priorEdition: { version: number; periodLabel: string } | null;
    systemCount: { from: number; to: number };
    worstTier: { from: number; to: number };
    byReadiness: {
      ready: { from: number; to: number };
      conditionally_ready: { from: number; to: number };
      not_ready: { from: number; to: number };
      live: { from: number; to: number };
    };
    incidentsTotal: { from: number; to: number };
  };
  generatedAt: string;
}

export interface OrgDeltaInputs {
  systemCount: number;
  worstTier: number;
  byReadiness: {
    ready: number;
    conditionally_ready: number;
    not_ready: number;
    live: number;
  };
  incidentsTotal: number;
}

export function computeOrgDeltas(
  current: OrgDeltaInputs,
  prior: OrgDeltaInputs | null,
  priorEdition: { version: number; periodLabel: string } | null,
): TxrOrgSnapshot["deltas"] {
  const pair = (from: number, to: number) => ({ from, to });
  const b = current.byReadiness;
  const pb = prior?.byReadiness;
  return {
    priorEdition,
    systemCount: pair(
      prior?.systemCount ?? current.systemCount,
      current.systemCount,
    ),
    worstTier: pair(prior?.worstTier ?? current.worstTier, current.worstTier),
    byReadiness: {
      ready: pair(pb?.ready ?? b.ready, b.ready),
      conditionally_ready: pair(
        pb?.conditionally_ready ?? b.conditionally_ready,
        b.conditionally_ready,
      ),
      not_ready: pair(pb?.not_ready ?? b.not_ready, b.not_ready),
      live: pair(pb?.live ?? b.live, b.live),
    },
    incidentsTotal: pair(
      prior?.incidentsTotal ?? current.incidentsTotal,
      current.incidentsTotal,
    ),
  };
}

const BATCH = 10;

export async function buildOrgSnapshot(
  db: OrgScopedClient,
  params: { orgId: string; periodStart: Date; periodEnd: Date },
  prior: {
    report: { version: number; periodLabel: string };
    snapshot: TxrOrgSnapshot;
  } | null,
): Promise<TxrOrgSnapshot> {
  const { orgId, periodStart, periodEnd } = params;

  const usecases = await db.aiUsecase.findMany({
    where: {
      orgId,
      lifecycleStage: { in: ["development", "production", "deprecated"] },
    },
    select: { id: true },
  });
  const ids = usecases.map((u) => u.id);

  const incRows = ids.length
    ? await db.incident.findMany({
        where: {
          orgId,
          openedAt: { gte: periodStart, lte: periodEnd },
          relatedUsecaseId: { in: ids },
        },
        select: { relatedUsecaseId: true, severity: true },
      })
    : [];
  const incByUsecase = new Map<
    string,
    {
      total: number;
      bySeverity: {
        low: number;
        medium: number;
        high: number;
        critical: number;
      };
    }
  >();
  for (const id of ids) {
    incByUsecase.set(id, {
      total: 0,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
    });
  }
  for (const r of incRows) {
    if (!r.relatedUsecaseId) continue;
    const b = incByUsecase.get(r.relatedUsecaseId);
    if (!b) continue;
    b.total += 1;
    b.bySeverity[r.severity] += 1;
  }

  const portfolio: TxrOrgSnapshot["portfolio"] = [];
  for (let i = 0; i < usecases.length; i += BATCH) {
    const slice = usecases.slice(i, i + BATCH);
    const snaps = await Promise.all(
      slice.map((u) => buildDossierSnapshot(db, orgId, u.id)),
    );
    for (let j = 0; j < snaps.length; j++) {
      const snap = snaps[j];
      if (!snap) continue;
      const usecaseId = slice[j].id;
      const evaluation = evaluateReadiness(snap);
      const frt = await aggregateFrtTiers(db, orgId, usecaseId);
      const inc = incByUsecase.get(usecaseId) ?? {
        total: 0,
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      };
      portfolio.push({
        usecaseId,
        name: snap.system.name,
        ownerName: snap.system.ownerName,
        isHighRisk: snap.classification.isHighRisk,
        euAiActCategory: snap.classification.euAiActCategory,
        frtTier: frt.overallTier,
        readinessState: evaluation.state,
        blockingCheckIds: evaluation.checks
          .filter((c) => c.severity === "blocking" && c.status === "fail")
          .map((c) => c.id),
        incidents: inc,
      });
    }
  }

  const byReadiness: Record<GoLiveState, number> = {
    ready: 0,
    conditionally_ready: 0,
    not_ready: 0,
    needs_re_review: 0,
    live: 0,
  };
  const tierDistribution: Record<"0" | "1" | "2" | "3", number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
  };
  let highRiskBlocked = 0;
  let worstTier = 0;
  for (const p of portfolio) {
    byReadiness[p.readinessState] += 1;
    const tierKey = String(Math.min(3, Math.max(0, p.frtTier))) as
      "0" | "1" | "2" | "3";
    tierDistribution[tierKey] += 1;
    worstTier = Math.max(worstTier, p.frtTier);
    if (p.isHighRisk && p.readinessState === "not_ready") highRiskBlocked += 1;
  }

  const orgIncidents = await aggregateIncidents(
    db,
    orgId,
    null,
    periodStart,
    periodEnd,
  );
  const drift = await aggregateDrift(db, orgId, periodStart, periodEnd);
  const posture = await aggregatePosture(db, orgId);

  const totals: TxrOrgSnapshot["totals"] = {
    systemCount: portfolio.length,
    byReadiness,
    highRiskBlocked,
    worstTier,
    tierDistribution,
    incidents: {
      total: orgIncidents.total,
      bySeverity: orgIncidents.bySeverity,
      byCategory: orgIncidents.byCategory,
    },
  };

  const deltas = computeOrgDeltas(
    {
      systemCount: totals.systemCount,
      worstTier: totals.worstTier,
      byReadiness: totals.byReadiness,
      incidentsTotal: totals.incidents.total,
    },
    prior
      ? {
          systemCount: prior.snapshot.totals.systemCount,
          worstTier: prior.snapshot.totals.worstTier,
          byReadiness: prior.snapshot.totals.byReadiness,
          incidentsTotal: prior.snapshot.totals.incidents.total,
        }
      : null,
    prior
      ? {
          version: prior.report.version,
          periodLabel: prior.report.periodLabel,
        }
      : null,
  );

  return {
    portfolio,
    totals,
    drift,
    posture,
    deltas,
    generatedAt: new Date().toISOString(),
  };
}
