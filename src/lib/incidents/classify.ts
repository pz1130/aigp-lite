import type { Policy, IncidentCategory, IncidentSeverity } from "@/lib/prisma";

export type Trigger = "block" | "burst";
export interface Classification {
  category: IncidentCategory;
  severity: IncidentSeverity;
}

export function classify(policy: Policy, trigger: Trigger): Classification {
  const s = policy.scope;
  const sev = policy.severity;
  const enf = policy.enforcementMode;

  if (s === "output") {
    if (sev === "high" && enf === "block" && trigger === "block")
      return { category: "data_leak", severity: "critical" };
    if (
      sev === "high" &&
      (enf === "warn" || enf === "log") &&
      trigger === "burst"
    )
      return { category: "data_leak", severity: "high" };
    if ((sev === "medium" || sev === "low") && trigger === "burst")
      return { category: "trust_failure", severity: "medium" };
  }

  if (s === "input") {
    if (sev === "high" && enf === "block" && trigger === "block")
      return { category: "policy_bypass", severity: "high" };
    if (trigger === "burst")
      return { category: "policy_bypass", severity: "medium" };
  }

  if (s === "both") {
    if (enf === "block" && trigger === "block")
      return { category: "capability_breach", severity: "high" };
    if (trigger === "burst")
      return { category: "capability_breach", severity: "medium" };
  }

  // Fallback: policy_bypass with severity copied from policy.severity.
  const sevMap: Record<typeof sev, IncidentSeverity> = {
    low: "low",
    medium: "medium",
    high: "high",
  };
  return { category: "policy_bypass", severity: sevMap[sev] };
}
