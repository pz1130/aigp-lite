import { hasPermission } from "@/lib/rbac/check";
import type { Permission, Role } from "@/lib/rbac/roles";
import type { DossierSnapshot, ReadinessEvaluation } from "./types";

const PERMISSIONS: Record<string, Permission> = {
  classified: "inventory.write",
  risk_management: "risk.write",
  regulatory_risks: "risk.write",
  data_governance: "data_lineage.write",
  documentation: "inventory.write",
  logging: "inventory.write",
  fria: "fria.write",
  transparency: "transparency-report.write",
  redteam: "redteam.write",
  external_redteam: "redteam.write",
  drift: "drift.write",
  alignment_audit: "alignment-audit.write",
  incidents: "incident.write",
  human_oversight: "inventory.write",
  capability_tier_assessed: "frontier-risk-tier.write",
};

const RISK_TEAM_CHECKS = new Set([
  "risk_management",
  "regulatory_risks",
  "fria",
  "alignment_audit",
  "capability_tier_assessed",
]);

export function nextActions(
  snapshot: DossierSnapshot,
  readiness: ReadinessEvaluation,
  role: Role,
) {
  if (snapshot.system.lifecycleStage === "deprecated") return [];
  return readiness.checks
    .filter((check) => check.status === "fail" || check.status === "warn")
    .sort(
      (a, b) =>
        Number(b.severity === "blocking") - Number(a.severity === "blocking"),
    )
    .map((check) => ({
      ...check,
      canAct: hasPermission(role, PERMISSIONS[check.id]),
      responsible: RISK_TEAM_CHECKS.has(check.id)
        ? ("risk" as const)
        : ("owner" as const),
    }));
}

export function isMyApproval(
  instance: {
    state: string;
    currentStep: number;
    steps: {
      stepIndex: number;
      decision: string;
      assigneeUserId: string | null;
      assigneeRole: string | null;
    }[];
  },
  userId: string,
  role: Role,
) {
  if (instance.state !== "open" || !hasPermission(role, "workflow.write"))
    return false;
  const step = instance.steps.find((s) => s.stepIndex === instance.currentStep);
  return (
    !!step &&
    ["pending", "requested_changes"].includes(step.decision) &&
    (role === "admin" ||
      step.assigneeUserId === userId ||
      step.assigneeRole === role)
  );
}
