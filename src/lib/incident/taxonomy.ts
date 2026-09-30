// Taxonomy adapted from Microsoft Agent Governance Toolkit (MIT)
// incident-response-workflow.md and OWASP Agentic Top 10 (2026).
import type { IncidentSeverity, IncidentCategory } from "@/lib/prisma";

// MS AGT 4-tier SLA — incident-response-workflow.md §1.1
export const SLA_MS: Record<IncidentSeverity, number> = {
  critical: 1 * 60 * 60 * 1000, // 1h
  high: 4 * 60 * 60 * 1000, // 4h
  medium: 24 * 60 * 60 * 1000, // 24h
  low: 7 * 24 * 60 * 60 * 1000, // 1w
};

// UI-only label; never persisted
export const P_CODE: Record<IncidentSeverity, "P0" | "P1" | "P2" | "P3"> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

// Category → default OWASP ASI 2026 references.
// Empty array = category has no clean ASI Top 10 mapping.
// Used as default on create only; user can override via updateClassification.
export const CATEGORY_OWASP_ASI: Record<IncidentCategory, string[]> = {
  hijack: ["ASI-01"], // Agent Goal Hijack
  capability_breach: ["ASI-02"], // Tool Misuse & Exploitation
  data_leak: ["ASI-06"], // Hostile/Manipulative Context (PII path)
  trust_failure: ["ASI-03"], // Identity & Privilege Abuse
  cascade: ["ASI-08"], // Swarm / Cascade
  audit_failure: [], // No ASI Top 10 equivalent
  resource_abuse: ["ASI-08"], // Closest fit: Swarm includes resource exhaustion
  bias_harm: [], // Fairness — orthogonal to ASI
  policy_bypass: [], // Governance — orthogonal
};

export function computeSlaDeadline(
  severity: IncidentSeverity,
  openedAt: Date,
): Date {
  return new Date(openedAt.getTime() + SLA_MS[severity]);
}
