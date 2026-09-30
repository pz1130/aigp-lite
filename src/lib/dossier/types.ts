export type CheckStatus = "pass" | "warn" | "fail" | "na";
export type CheckSeverity = "blocking" | "advisory";
export type GoLiveState =
  "not_ready" | "conditionally_ready" | "ready" | "live" | "needs_re_review";

export type MetricValue = number | boolean | string | null;

export interface ReadinessCheck {
  id: string;
  status: CheckStatus;
  severity: CheckSeverity;
  articleRefs: string[];
  deepLink: string;
  metric: Record<string, MetricValue>;
}

export interface ReadinessEvaluation {
  checks: ReadinessCheck[];
  state: GoLiveState;
  blockingFailing: number;
  advisoryOpen: number;
}

export interface GoLiveCurrent {
  id: string;
  status: "draft" | "approved" | "live" | "rejected" | "withdrawn";
  rationale: string;
  conditions: string[];
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  boundTier: number | null;
  boundModelRef: string | null;
  staleApproval: boolean;
}

export interface DossierSnapshot {
  system: {
    id: string;
    name: string;
    ownerId: string;
    ownerName: string | null;
    lifecycleStage: string;
    autonomyLevel: string;
    deploymentType: string;
    description: string;
    modelCardMd: string;
    intendedUseMd: string;
    prohibitedUseMd: string;
    humanOversightAttested: boolean;
    humanOversightAttestedByName: string | null;
    humanOversightAttestedAt: Date | null;
    updatedAt: Date;
    sunsetDate: Date | null;
    deprecatedAt: Date | null;
    deprecatedByName: string | null;
    deprecationReason: string;
  };
  classification: {
    present: boolean;
    euAiActCategory: string | null;
    isHighRisk: boolean;
    containsPii: boolean;
    dataSensitivity: string | null;
  };
  risk: { hasAssessment: boolean; controlsNotSatisfied: number };
  regulatoryRisks: { total: number; withoutRationale: number };
  dataGovernance: { dataSourceCount: number };
  documentation: { hasModelCard: boolean; versionCount: number };
  logging: { invocationCount: number };
  fria: { approvedCount: number };
  transparency: { publishedCount: number };
  redteam: { completedCount: number };
  externalRedteam: { attestationCount: number };
  drift: { benchmarkCount: number; completedRunCount: number };
  alignmentAudit: {
    status: "pass" | "concerns" | "fail" | "stale" | "missing";
  };
  incidents: { openHighOrCritical: number };
  capability: { assessed: boolean; effectiveTier: number | null };
  modelRef: string;
  goLive: GoLiveCurrent | null;
}
