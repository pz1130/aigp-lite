import { approvalNeedsReReview } from "./approval-fingerprint";
import type {
  DossierSnapshot,
  ReadinessCheck,
  ReadinessEvaluation,
  CheckSeverity,
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
      s.classification.present &&
      s.classification.euAiActCategory != null &&
      s.classification.euAiActCategory !== "unknown",
    deepLink: (s) => `/inventory/${s.system.id}/edit`,
    metric: (s) => ({ category: s.classification.euAiActCategory }),
  },
  {
    id: "risk_management",
    articleRefs: ["Art. 9"],
    severity: () => "blocking",
    satisfied: (s) => s.risk.hasAssessment && s.risk.controlsNotSatisfied === 0,
    deepLink: (s) => `/risk/usecases/${s.system.id}`,
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
    deepLink: (s) => `/risk/usecases/${s.system.id}`,
    metric: (s) => ({
      total: s.regulatoryRisks.total,
      withoutRationale: s.regulatoryRisks.withoutRationale,
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
    id: "fria",
    articleRefs: ["Art. 27"],
    severity: (s) => blockingIf(s.classification.isHighRisk),
    satisfied: (s) =>
      s.classification.isHighRisk ? s.fria.approvedCount > 0 : "na",
    deepLink: (s) => `/inventory/${s.system.id}/fria/new`,
    metric: (s) => ({ approvedCount: s.fria.approvedCount }),
  },
  {
    id: "human_oversight",
    articleRefs: ["Art. 14"],
    severity: () => "advisory",
    satisfied: (s) => s.system.humanOversightAttested,
    deepLink: (s) => `/inventory/${s.system.id}#oversight`,
    metric: (s) => ({ attested: s.system.humanOversightAttested }),
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

  const blockingFailing = checks.filter(
    (c) => c.severity === "blocking" && c.status === "fail",
  ).length;
  const advisoryOpen = checks.filter((c) => c.status === "warn").length;

  let state: ReadinessEvaluation["state"];
  if (approvalNeedsReReview(s.goLive, s.capability, s.modelRef)) {
    state = "needs_re_review";
  } else if (s.goLive?.status === "live") state = "live";
  else if (blockingFailing > 0) state = "not_ready";
  else if (advisoryOpen > 0) state = "conditionally_ready";
  else state = "ready";

  return { checks, state, blockingFailing, advisoryOpen };
}
