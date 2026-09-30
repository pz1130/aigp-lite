import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import type { MaterialityTier } from "@/lib/prisma";
import { effectiveTier, TIER_WEIGHT } from "@/lib/materiality/rubric";
import { RATING_SCORE, effectiveRating } from "@/lib/vendor/scoring";

export const POSTURE_WEIGHTS = {
  controls: 0.35,
  incidents: 0.2,
  drift: 0.15,
  budget: 0.1,
  vendor: 0.2,
} as const;

export interface PostureDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  raw: Record<string, unknown>;
}

export interface UsecasePostureRow {
  usecaseId: string;
  usecaseName: string;
  controlScore: number;
  openIncidents: number;
  slaBreaches: number;
  overallScore: number;
  effectiveTier: MaterialityTier | null;
}

export interface PosturePayload {
  score: number;
  dimensions: PostureDimension[];
  usecases: UsecasePostureRow[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function loadEffectiveTiers(
  db: OrgScopedClient,
  orgId: string,
): Promise<Map<string, MaterialityTier>> {
  const rows = await db.usecaseMateriality.findMany({
    where: { orgId },
    select: { usecaseId: true, computedTier: true, tierOverride: true },
  });
  const map = new Map<string, MaterialityTier>();
  for (const r of rows) map.set(r.usecaseId, effectiveTier(r));
  return map;
}

function dimensionControlsFromRows(
  rows: UsecasePostureRow[],
): PostureDimension {
  if (rows.length === 0) {
    return {
      key: "controls",
      label: "Control Coverage",
      score: 100,
      weight: POSTURE_WEIGHTS.controls,
      raw: { usecases: 0, ungraded: 0 },
    };
  }
  let weightedSum = 0;
  let weightTotal = 0;
  let ungraded = 0;
  for (const r of rows) {
    if (r.effectiveTier == null) ungraded++;
    const w = TIER_WEIGHT[r.effectiveTier ?? "limited"];
    weightedSum += r.controlScore * w;
    weightTotal += w;
  }
  const score = weightTotal === 0 ? 100 : Math.round(weightedSum / weightTotal);
  return {
    key: "controls",
    label: "Control Coverage",
    score: clamp(score, 0, 100),
    weight: POSTURE_WEIGHTS.controls,
    raw: { usecases: rows.length, ungraded },
  };
}

async function dimensionIncidents(
  db: OrgScopedClient,
  orgId: string,
): Promise<PostureDimension> {
  const openIncidents = await db.incident.findMany({
    where: { orgId, status: { in: ["open", "investigating"] } },
    select: {
      id: true,
      severity: true,
      slaDeadline: true,
      relatedUsecaseId: true,
    },
  });

  const now = new Date();
  const bySeverity: Record<string, number> = {};
  let breachCount = 0;

  for (const i of openIncidents) {
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
    if (i.slaDeadline && i.slaDeadline < now) breachCount++;
  }

  const penalty = breachCount * 15 + (bySeverity.critical ?? 0) * 10;
  const score = clamp(100 - penalty, 0, 100);

  return {
    key: "incidents",
    label: "Open Incidents",
    score,
    weight: POSTURE_WEIGHTS.incidents,
    raw: { openCount: openIncidents.length, breachCount, bySeverity },
  };
}

async function dimensionDrift(
  db: OrgScopedClient,
  orgId: string,
): Promise<PostureDimension> {
  const runs = await db.driftRun.findMany({
    where: { orgId, status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, benchmarkId: true, degraded: true, startedAt: true },
  });

  const latestByBenchmark = new Map<string, boolean>();
  for (const r of runs) {
    if (!latestByBenchmark.has(r.benchmarkId)) {
      latestByBenchmark.set(r.benchmarkId, r.degraded);
    }
  }

  const totalBenchmarks = latestByBenchmark.size;
  const degradedCount = Array.from(latestByBenchmark.values()).filter(
    Boolean,
  ).length;
  const greenCount = totalBenchmarks - degradedCount;

  const score =
    totalBenchmarks === 0
      ? 0
      : Math.round((greenCount / totalBenchmarks) * 100);

  return {
    key: "drift",
    label: "Drift Health",
    score: clamp(score, 0, 100),
    weight: POSTURE_WEIGHTS.drift,
    raw: { totalBenchmarks, degradedCount, greenCount },
  };
}

async function dimensionBudget(
  db: OrgScopedClient,
  orgId: string,
): Promise<PostureDimension> {
  const budgets = await db.budget.findMany({
    where: { orgId, isActive: true },
    select: {
      id: true,
      scope: true,
      scopeRefId: true,
      amountUsd: true,
      hardCap: true,
    },
  });

  const hardCapCount = budgets.filter((b) => b.hardCap).length;
  const totalActive = budgets.length;
  const score =
    totalActive === 0
      ? 100
      : Math.round(((totalActive - hardCapCount) / totalActive) * 100);

  return {
    key: "budget",
    label: "Budget Posture",
    score: clamp(score, 0, 100),
    weight: POSTURE_WEIGHTS.budget,
    raw: { totalActive, hardCapCount },
  };
}

async function dimensionVendor(
  db: OrgScopedClient,
  orgId: string,
): Promise<PostureDimension> {
  const inScope = await db.aiUsecase.findMany({
    where: { orgId, lifecycleStage: { in: ["development", "production"] } },
    select: { id: true },
  });
  const ids = inScope.map((u) => u.id);

  const links =
    ids.length === 0
      ? []
      : await db.vendorUsecaseLink.findMany({
          where: { orgId, usecaseId: { in: ids } },
          select: { vendorId: true },
        });
  const vendorIds = Array.from(new Set(links.map((l) => l.vendorId)));

  if (vendorIds.length === 0) {
    return {
      key: "vendor",
      label: "Vendor Risk",
      score: 100,
      weight: POSTURE_WEIGHTS.vendor,
      raw: { vendors: 0, unassessed: 0, highOrCritical: 0 },
    };
  }

  const vendors = await db.vendor.findMany({
    where: { orgId, id: { in: vendorIds } },
    select: { id: true, computedRating: true, ratingOverride: true },
  });

  let total = 0;
  let unassessed = 0;
  let highOrCritical = 0;
  for (const v of vendors) {
    const eff = effectiveRating(v);
    if (eff == null) {
      unassessed++;
    } else {
      total += RATING_SCORE[eff];
      if (eff === "high" || eff === "critical") highOrCritical++;
    }
  }
  const score = Math.round(total / vendors.length);

  return {
    key: "vendor",
    label: "Vendor Risk",
    score: clamp(score, 0, 100),
    weight: POSTURE_WEIGHTS.vendor,
    raw: { vendors: vendors.length, unassessed, highOrCritical },
  };
}

async function buildUsecaseRows(
  db: OrgScopedClient,
  orgId: string,
  incidentDim: PostureDimension,
  tiers: Map<string, MaterialityTier>,
): Promise<UsecasePostureRow[]> {
  const usecases = await db.aiUsecase.findMany({
    where: { orgId, lifecycleStage: { in: ["development", "production"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (usecases.length === 0) return [];

  const allControlRows = await db.usecaseControlStatus.findMany({
    where: { orgId },
    select: { usecaseId: true, status: true },
  });

  const incidents = (incidentDim.raw as unknown as {
    openCount: number;
    breachCount: number;
  })
    ? await db.incident.findMany({
        where: { orgId, status: { in: ["open", "investigating"] } },
        select: { relatedUsecaseId: true, slaDeadline: true },
      })
    : [];

  const controlByUsecase = new Map<
    string,
    { satisfied: number; inProgress: number; total: number }
  >();
  for (const c of allControlRows) {
    if (c.status === "not_applicable") continue;
    const bucket = controlByUsecase.get(c.usecaseId) ?? {
      satisfied: 0,
      inProgress: 0,
      total: 0,
    };
    bucket.total++;
    if (c.status === "satisfied") bucket.satisfied++;
    if (c.status === "in_progress") bucket.inProgress++;
    controlByUsecase.set(c.usecaseId, bucket);
  }

  const incidentByUsecase = new Map<string, { open: number; breach: number }>();
  const now = new Date();
  for (const i of incidents) {
    const uid = i.relatedUsecaseId;
    if (!uid) continue;
    const bucket = incidentByUsecase.get(uid) ?? { open: 0, breach: 0 };
    bucket.open++;
    if (i.slaDeadline && i.slaDeadline < now) bucket.breach++;
    incidentByUsecase.set(uid, bucket);
  }

  return usecases.map((u) => {
    const ctrl = controlByUsecase.get(u.id);
    const controlScore =
      ctrl && ctrl.total > 0
        ? Math.round(
            ((ctrl.satisfied + ctrl.inProgress * 0.5) / ctrl.total) * 100,
          )
        : 0;
    const inc = incidentByUsecase.get(u.id) ?? { open: 0, breach: 0 };
    const overallScore = controlScore;
    return {
      usecaseId: u.id,
      usecaseName: u.name,
      controlScore,
      openIncidents: inc.open,
      slaBreaches: inc.breach,
      overallScore,
      effectiveTier: tiers.get(u.id) ?? null,
    };
  });
}

export async function computePosture(
  db: OrgScopedClient,
  orgId: string,
): Promise<PosturePayload> {
  const [incidents, drift, budget, vendor, tiers] = await Promise.all([
    dimensionIncidents(db, orgId),
    dimensionDrift(db, orgId),
    dimensionBudget(db, orgId),
    dimensionVendor(db, orgId),
    loadEffectiveTiers(db, orgId),
  ]);

  const usecases = await buildUsecaseRows(db, orgId, incidents, tiers);
  const controls = dimensionControlsFromRows(usecases);

  const dimensions = [controls, incidents, drift, budget, vendor];
  const score = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  return { score: clamp(score, 0, 100), dimensions, usecases };
}
