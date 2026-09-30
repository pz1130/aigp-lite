import { requiredBlockingChecks } from "@/lib/frontier-risk-tier/safeguard-binding";
import { approvalNeedsReReview } from "./approval-fingerprint";
import type {
  DossierSnapshot,
  ReadinessCheck,
  ReadinessEvaluation,
  CheckSeverity,
  CheckStatus,
  MetricValue,
} from "./types";

interface CheckDef {
  id: string;
  articleRefs: string[];
  severity: (s: DossierSnapshot) => CheckSeverity;
  satisfied: (s: DossierSnapshot) => boolean | "na";
  deepLink: (s: DossierSnapshot) => string;
  metric: (s: DossierSnapshot) => Record<string, MetricValue>;
}

const blockingIf = (cond: boolean): CheckSeverity =>
  cond ? "blocking" : "advisory";

const CHECKS: CheckDef[] = [
  {
    id: "classified",
    articleRefs: [],
    severity: () => "blocking",
    satisfied: (s) =>
      s.classification.present && s.classification.euAiActCategory != null,
    deepLink: (s) => `/inventory/${s.system.id}#classification`,
    metric: (s) => ({ category: s.classification.euAiActCategory }),
  },
  {
    id: "risk_management",
    articleRefs: ["Art. 9"],
    severity: () => "blocking",
    satisfied: (s) => s.risk.hasAssessment && s.risk.controlsNotSatisfied === 0,
    deepLink: () => `/risk`,
    metric: (s) => ({
      hasAssessment: s.risk.hasAssessment,
      controlsNotSatisfied: s.risk.controlsNotSatisfied,
    }),
  },
  {
    id: "regulatory_risks",
    articleRefs: [],
    severity: (s) => blockingIf(s.classification.isHighRisk),
    satisfied: (s) => s.regulatoryRisks.withoutRationale === 0,
    deepLink: (s) => `/inventory/${s.system.id}#risks`,
    metric: (s) => ({
      total: s.regulatoryRisks.total,
      withoutRationale: s.regulatoryRisks.withoutRationale,
    }),
  },
  {
    id: "data_governance",
    articleRefs: ["Art. 10"],
    severity: (s) => blockingIf(s.classification.containsPii),
    satisfied: (s) =>
      s.dataGovernance.dataSourceCount > 0 &&
      (!s.classification.containsPii ||
        s.classification.dataSensitivity != null),
    deepLink: () => `/data-lineage`,
    metric: (s) => ({
      dataSourceCount: s.dataGovernance.dataSourceCount,
      containsPii: s.classification.containsPii,
    }),
  },
  {
    id: "documentation",
    articleRefs: ["Art. 11"],
    severity: () => "advisory",
    satisfied: (s) =>
      s.documentation.hasModelCard && s.documentation.versionCount > 0,
    deepLink: (s) => `/inventory/${s.system.id}#documentation`,
    metric: (s) => ({
      hasModelCard: s.documentation.hasModelCard,
      versionCount: s.documentation.versionCount,
    }),
  },
  {
    id: "logging",
    articleRefs: ["Art. 12"],
    severity: () => "advisory",
    satisfied: (s) => s.logging.invocationCount > 0,
    deepLink: (s) => `/inventory/${s.system.id}#activity`,
    metric: (s) => ({ invocationCount: s.logging.invocationCount }),
  },
  {
    id: "fria",
    articleRefs: ["Art. 27"],
    severity: (s) => blockingIf(s.classification.isHighRisk),
    satisfied: (s) => s.fria.approvedCount > 0,
    deepLink: (s) => `/inventory/${s.system.id}/fria`,
    metric: (s) => ({ approvedCount: s.fria.approvedCount }),
  },
  {
    id: "transparency",
    articleRefs: ["Art. 13", "Art. 50"],
    severity: () => "advisory",
    satisfied: (s) => s.transparency.publishedCount > 0,
    deepLink: () => `/transparency-report`,
    metric: (s) => ({ publishedCount: s.transparency.publishedCount }),
  },
  {
    id: "redteam",
    articleRefs: ["Art. 15"],
    severity: (s) => blockingIf(s.classification.isHighRisk),
    satisfied: (s) => s.redteam.completedCount > 0,
    deepLink: () => `/redteam`,
    metric: (s) => ({ completedCount: s.redteam.completedCount }),
  },
  {
    id: "external_redteam",
    articleRefs: ["Art. 15"],
    severity: (s) => blockingIf(s.classification.isHighRisk),
    satisfied: (s) => s.externalRedteam.attestationCount > 0,
    deepLink: (s) => `/inventory/${s.system.id}#redteam`,
    metric: (s) => ({ attestationCount: s.externalRedteam.attestationCount }),
  },
  {
    id: "drift",
    articleRefs: ["Art. 15"],
    severity: () => "advisory",
    satisfied: (s) =>
      s.drift.benchmarkCount > 0 && s.drift.completedRunCount > 0,
    deepLink: () => `/drift`,
    metric: (s) => ({
      benchmarkCount: s.drift.benchmarkCount,
      completedRunCount: s.drift.completedRunCount,
    }),
  },
  {
    id: "alignment_audit",
    articleRefs: ["Art. 15"],
    severity: (s) => {
      const st = s.alignmentAudit.status;
      if (st === "fail") return "blocking";
      if (st === "concerns") return "advisory";
      return blockingIf(s.classification.isHighRisk);
    },
    satisfied: (s) => s.alignmentAudit.status === "pass",
    deepLink: () => `/alignment-audit`,
    metric: (s) => ({ status: s.alignmentAudit.status }),
  },
  {
    id: "incidents",
    articleRefs: [],
    severity: () => "blocking",
    satisfied: (s) => s.incidents.openHighOrCritical === 0,
    deepLink: () => `/incidents`,
    metric: (s) => ({ openHighOrCritical: s.incidents.openHighOrCritical }),
  },
  {
    id: "human_oversight",
    articleRefs: ["Art. 14"],
    severity: () => "advisory",
    satisfied: (s) => s.system.humanOversightAttested,
    deepLink: (s) => `/inventory/${s.system.id}#oversight`,
    metric: (s) => ({ attested: s.system.humanOversightAttested }),
  },
  {
    id: "capability_tier_assessed",
    articleRefs: ["Art. 9"],
    severity: (s) => blockingIf(s.classification.isHighRisk),
    satisfied: (s) => s.capability.assessed,
    deepLink: (s) => `/inventory/${s.system.id}#frt`,
    metric: (s) => ({
      assessed: s.capability.assessed,
      effectiveTier: s.capability.effectiveTier,
    }),
  },
];

export const READINESS_CHECK_IDS = CHECKS.map((c) => c.id);

export function evaluateReadiness(s: DossierSnapshot): ReadinessEvaluation {
  const checks: ReadinessCheck[] = CHECKS.map((def) => {
    const severity = def.severity(s);
    const sat = def.satisfied(s);
    const status =
      sat === "na"
        ? "na"
        : sat
          ? "pass"
          : severity === "blocking"
            ? "fail"
            : "warn";
    return {
      id: def.id,
      status,
      severity,
      articleRefs: def.articleRefs,
      deepLink: def.deepLink(s),
      metric: def.metric(s),
    };
  });

  const required = requiredBlockingChecks(s.capability.effectiveTier);
  const elevatedChecks: ReadinessCheck[] = checks.map((c) => {
    if (!required.has(c.id)) return c;
    const severity: CheckSeverity = "blocking";
    const status: CheckStatus = c.status === "warn" ? "fail" : c.status;
    return {
      ...c,
      severity,
      status,
      metric: {
        ...c.metric,
        requiredAtTier: s.capability.effectiveTier,
      },
    };
  });

  const blockingFailing = elevatedChecks.filter(
    (c) => c.severity === "blocking" && c.status === "fail",
  ).length;
  const advisoryOpen = elevatedChecks.filter((c) => c.status === "warn").length;

  let state: ReadinessEvaluation["state"];
  if (approvalNeedsReReview(s.goLive, s.capability, s.modelRef)) {
    state = "needs_re_review";
  } else if (s.goLive?.status === "live") state = "live";
  else if (blockingFailing > 0) state = "not_ready";
  else if (advisoryOpen > 0) state = "conditionally_ready";
  else state = "ready";

  return { checks: elevatedChecks, state, blockingFailing, advisoryOpen };
}
