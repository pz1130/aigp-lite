import type { OrgScopedClient } from "@/lib/db/orgIsolation";

export interface DimensionScore {
  key: string;
  score: number;
  weight: number;
  raw: Record<string, number>;
}

export interface GovernanceScore {
  overall: number;
  dimensions: DimensionScore[];
}

const BASE_WEIGHTS = {
  controls: 0.25,
  risk: 0.2,
  incidents: 0.2,
  policies: 0.15,
  process: 0.1,
  survey: 0.1,
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** D1: Control Satisfaction — satisfied / (total − not_applicable) */
async function scoreControls(
  db: OrgScopedClient,
  orgId: string,
): Promise<DimensionScore> {
  const [applicable, satisfied] = await Promise.all([
    db.usecaseControlStatus.count({
      where: { orgId, status: { not: "not_applicable" } },
    }),
    db.usecaseControlStatus.count({
      where: { orgId, status: "satisfied" },
    }),
  ]);
  const score =
    applicable === 0 ? 0 : Math.round((satisfied / applicable) * 100);
  return {
    key: "controls",
    score,
    weight: BASE_WEIGHTS.controls,
    raw: { applicable, satisfied },
  };
}

/** D2: Risk Coverage — % assessed active usecases + avg-score bonus */
async function scoreRisk(
  db: OrgScopedClient,
  orgId: string,
): Promise<DimensionScore> {
  const activeUsecases = await db.aiUsecase.count({
    where: { orgId, lifecycleStage: { in: ["development", "production"] } },
  });

  if (activeUsecases === 0) {
    return {
      key: "risk",
      score: 0,
      weight: BASE_WEIGHTS.risk,
      raw: { activeUsecases: 0, assessed: 0, avgScore: 0 },
    };
  }

  const assessedRows = await db.usecaseRiskAssessment.findMany({
    where: { orgId },
    select: { usecaseId: true, scoreInt: true },
    orderBy: { assessedAt: "desc" },
  });

  const latestByUsecase = new Map<string, number>();
  for (const r of assessedRows) {
    if (!latestByUsecase.has(r.usecaseId)) {
      latestByUsecase.set(r.usecaseId, r.scoreInt);
    }
  }

  const assessed = latestByUsecase.size;
  const coverage = (assessed / activeUsecases) * 100;
  const scores = Array.from(latestByUsecase.values());
  const avgScore =
    assessed === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / assessed;
  const avgBonus = clamp((50 - avgScore) / 2, -10, 10);
  const score = clamp(Math.round(coverage + avgBonus), 0, 100);

  return {
    key: "risk",
    score,
    weight: BASE_WEIGHTS.risk,
    raw: { activeUsecases, assessed, avgScore: Math.round(avgScore) },
  };
}

/** D3: Incident Health — SLA compliance + overdue/critical penalties */
async function scoreIncidents(
  db: OrgScopedClient,
  orgId: string,
): Promise<DimensionScore> {
  const [total, closedOnTime, overdue, openCritical] = await Promise.all([
    db.incident.count({ where: { orgId } }),
    db.incident.count({
      where: {
        orgId,
        status: "closed",
        closedAt: { not: null },
        slaDeadline: { not: null },
      },
    }),
    db.incident.count({
      where: {
        orgId,
        status: { in: ["open", "investigating"] },
        slaDeadline: { lt: new Date() },
      },
    }),
    db.incident.count({
      where: { orgId, status: "open", severity: "critical" },
    }),
  ]);

  // For closedOnTime, we need to verify closedAt <= slaDeadline.
  // Prisma can't do field-vs-field comparison directly, so we fetch and count in JS.
  let actualClosedOnTime = closedOnTime;
  if (closedOnTime > 0) {
    const closed = await db.incident.findMany({
      where: {
        orgId,
        status: "closed",
        closedAt: { not: null },
        slaDeadline: { not: null },
      },
      select: { closedAt: true, slaDeadline: true },
    });
    actualClosedOnTime = closed.filter(
      (i) => i.closedAt && i.slaDeadline && i.closedAt <= i.slaDeadline,
    ).length;
  }

  const slaRatio = total === 0 ? 100 : (actualClosedOnTime / total) * 100;
  const score = clamp(
    Math.round(slaRatio - overdue * 5 - openCritical * 10),
    0,
    100,
  );

  return {
    key: "incidents",
    score,
    weight: BASE_WEIGHTS.incidents,
    raw: { total, closedOnTime: actualClosedOnTime, overdue, openCritical },
  };
}

/** D4: Policy Enforcement — enabled ratio + active evaluation bonus */
async function scorePolicies(
  db: OrgScopedClient,
  orgId: string,
): Promise<DimensionScore> {
  const [totalPolicies, enabledPolicies, hitsThisWeek] = await Promise.all([
    db.policy.count({ where: { orgId } }),
    db.policy.count({ where: { orgId, enabled: true } }),
    db.policyEvaluation.count({
      where: { orgId, ts: { gte: new Date(Date.now() - 7 * 86400_000) } },
    }),
  ]);

  if (totalPolicies === 0) {
    return {
      key: "policies",
      score: 0,
      weight: BASE_WEIGHTS.policies,
      raw: { totalPolicies: 0, enabledPolicies: 0, hitsThisWeek },
    };
  }

  const enabledRatio = (enabledPolicies / totalPolicies) * 100;
  const bonus = hitsThisWeek > 0 ? 5 : 0;
  const score = clamp(Math.round(enabledRatio + bonus), 0, 100);

  return {
    key: "policies",
    score,
    weight: BASE_WEIGHTS.policies,
    raw: { totalPolicies, enabledPolicies, hitsThisWeek },
  };
}

/** D5: Process Completeness — classification + FRIA + evidence averages */
async function scoreProcess(
  db: OrgScopedClient,
  orgId: string,
): Promise<DimensionScore> {
  const activeUsecases = await db.aiUsecase.count({
    where: { orgId, lifecycleStage: { in: ["development", "production"] } },
  });

  if (activeUsecases === 0) {
    return {
      key: "process",
      score: 0,
      weight: BASE_WEIGHTS.process,
      raw: {
        activeUsecases: 0,
        classified: 0,
        friaApproved: 0,
        evidenceCtrl: 0,
        totalControls: 0,
      },
    };
  }

  const [classified, friaApproved, orgControlRows, evidenceRows] =
    await Promise.all([
      db.usecaseClassification.count({ where: { orgId } }),
      db.usecaseFria.count({ where: { orgId, status: "approved" } }),
      db.usecaseControlStatus.findMany({
        where: { orgId },
        select: { controlId: true },
        distinct: ["controlId"],
      }),
      db.evidence.findMany({
        where: { orgId, controlId: { not: null } },
        select: { controlId: true },
        distinct: ["controlId"],
      }),
    ]);

  const totalControls = orgControlRows.length;
  const ctrlWithEvidence = evidenceRows.filter(
    (e) => e.controlId !== null,
  ).length;

  const classCoverage = (classified / activeUsecases) * 100;
  const friaCoverage = (friaApproved / activeUsecases) * 100;
  const evidenceCoverage =
    totalControls === 0 ? 0 : (ctrlWithEvidence / totalControls) * 100;

  const score = Math.round(
    (classCoverage + friaCoverage + evidenceCoverage) / 3,
  );

  return {
    key: "process",
    score,
    weight: BASE_WEIGHTS.process,
    raw: {
      activeUsecases,
      classified,
      friaApproved,
      totalControls,
      ctrlWithEvidence,
    },
  };
}

/** D6: Maturity Survey — latest pillar avg %. Returns null if no survey data. */
async function scoreSurvey(
  db: OrgScopedClient,
  orgId: string,
): Promise<DimensionScore | null> {
  const pillars = [
    "mandate_and_scope",
    "structure_and_roles",
    "processes",
    "decision_rights",
    "culture",
    "communication",
  ] as const;

  const latest = await Promise.all(
    pillars.map((p) =>
      db.governanceMaturityAssessment.findFirst({
        where: { orgId, pillar: p },
        orderBy: { ts: "desc" },
        select: { scoreInt: true, maxScore: true },
      }),
    ),
  );

  const found = latest.filter(
    (r): r is { scoreInt: number; maxScore: number } => r !== null,
  );
  if (found.length === 0) return null;

  const avgPct =
    found.reduce((sum, r) => sum + (r.scoreInt / r.maxScore) * 100, 0) /
    found.length;
  const score = Math.round(avgPct);

  return {
    key: "survey",
    score,
    weight: BASE_WEIGHTS.survey,
    raw: { pillarsFound: found.length, avgPct: Math.round(avgPct) },
  };
}

/**
 * Compute the overall governance score from 6 automated dimensions.
 * If the maturity survey (D6) has no data, its weight redistributes to D1-D5.
 */
export async function computeGovernanceScore(
  db: OrgScopedClient,
  orgId: string,
): Promise<GovernanceScore> {
  const [d1, d2, d3, d4, d5, d6] = await Promise.all([
    scoreControls(db, orgId),
    scoreRisk(db, orgId),
    scoreIncidents(db, orgId),
    scorePolicies(db, orgId),
    scoreProcess(db, orgId),
    scoreSurvey(db, orgId),
  ]);

  const dimensions: DimensionScore[] = [d1, d2, d3, d4, d5];
  if (d6) {
    dimensions.push(d6);
  } else {
    // Redistribute D6 weight proportionally to D1-D5
    const d6Weight = BASE_WEIGHTS.survey;
    const baseTotal = 1 - d6Weight;
    for (const d of dimensions) {
      d.weight = d.weight / baseTotal;
    }
  }

  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  return { overall: clamp(overall, 0, 100), dimensions };
}
