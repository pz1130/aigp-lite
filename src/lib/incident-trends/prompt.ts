import type { TrendStats } from "./stats";

export interface ClusterPromptIncident {
  title: string;
  category: string | null;
  severity: string;
  rootCause: string;
  usecaseName: string | null;
  rcaSummary: string | null;
}

export function buildClusterSystemPrompt(): string {
  return [
    "You are an AI governance analyst. You are given a CLUSTER of related AI",
    "incidents from one organization. Identify the shared root cause and a",
    "single systemic (estate-level, not incident-level) remediation.",
    "",
    "Respond with STRICT JSON only — no prose, no code fences — matching:",
    "{",
    '  "label": string (<=80 chars, a short theme),',
    '  "narrative": string (synthesize the shared root cause),',
    '  "systemicRecommendation": string (one estate-level fix),',
    '  "confidence": "low" | "medium" | "high"',
    "}",
    "Ground every claim in the incidents provided. Do not invent details.",
  ].join("\n");
}

export function buildClusterUserMessage(
  incidents: ClusterPromptIncident[],
): string {
  const lines = incidents.map((i, n) => {
    const parts = [
      `Incident ${n + 1}: ${i.title}`,
      `  category: ${i.category ?? "uncategorized"} | severity: ${i.severity}`,
      `  use-case: ${i.usecaseName ?? "n/a"}`,
    ];
    if (i.rootCause.trim()) parts.push(`  rootCause: ${i.rootCause}`);
    if (i.rcaSummary && i.rcaSummary.trim())
      parts.push(`  RCA summary: ${i.rcaSummary}`);
    return parts.join("\n");
  });
  return `Cluster of ${incidents.length} incidents:\n\n${lines.join("\n\n")}`;
}

export function buildExecSummaryPrompt(
  clusters: { label: string; memberCount: number }[],
  stats: TrendStats,
): { system: string; user: string } {
  const system = [
    "You are an AI governance analyst writing a short executive summary for a",
    "Chief AI Officer. Summarize the systemic incident trends across the AI",
    "estate in one tight paragraph.",
    "",
    'Respond with STRICT JSON only: { "execSummary": string }.',
  ].join("\n");

  const clusterLines = clusters
    .map((c) => `- ${c.label} (${c.memberCount} incidents)`)
    .join("\n");
  const sev = Object.entries(stats.bySeverity)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const user = [
    `Total incidents analyzed: ${stats.total}`,
    `Severity breakdown: ${sev || "none"}`,
    `Clustered: ${stats.clusteredCount}; long-tail: ${stats.longTailCount}`,
    "",
    "Themes:",
    clusterLines || "- (no multi-incident clusters)",
  ].join("\n");

  return { system, user };
}
