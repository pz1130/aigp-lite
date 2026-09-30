import type { UsageStats } from "./stats";

export interface ClusterPromptRow {
  text: string;
  toolName: string;
  outcome: string;
}

export function buildClusterSystemPrompt(): string {
  return [
    "You are an AI governance analyst. You are given a CLUSTER of related AI",
    "tool-usage records (already PII-scrubbed) from one organization.",
    "Describe the shared usage theme and one estate-level observation about how",
    "this capability is being used.",
    "",
    "PRIVACY: describe the theme in aggregate only. Do NOT quote or reproduce",
    "any verbatim snippet, user input, or identifier. No snippets.",
    "",
    "Respond with STRICT JSON only — no prose, no code fences — matching:",
    "{",
    '  "label": string (<=80 chars, a short usage theme),',
    '  "narrative": string (aggregate description of how the tool is used),',
    '  "systemicObservation": string (one estate-level observation),',
    '  "confidence": "low" | "medium" | "high"',
    "}",
    "Ground every claim in the records provided. Do not invent details.",
  ].join("\n");
}

export function buildClusterUserMessage(rows: ClusterPromptRow[]): string {
  const toolCounts = new Map<string, number>();
  const outcomeCounts = new Map<string, number>();
  for (const r of rows) {
    toolCounts.set(r.toolName, (toolCounts.get(r.toolName) ?? 0) + 1);
    outcomeCounts.set(r.outcome, (outcomeCounts.get(r.outcome) ?? 0) + 1);
  }
  const tools = [...toolCounts.entries()]
    .map(([t, n]) => `${t}=${n}`)
    .join(", ");
  const outcomes = [...outcomeCounts.entries()]
    .map(([o, n]) => `${o}=${n}`)
    .join(", ");
  const samples = rows
    .slice(0, 20)
    .map((r, n) => `  ${n + 1}. [${r.toolName}] ${r.text}`)
    .join("\n");
  return [
    `Cluster of ${rows.length} tool-usage records.`,
    `Tools: ${tools}`,
    `Outcomes: ${outcomes}`,
    "",
    "Scrubbed record excerpts (for theme inference only — do not echo):",
    samples,
  ].join("\n");
}

export function buildExecSummaryPrompt(
  clusters: { label: string; count: number }[],
  stats: UsageStats,
): { system: string; user: string } {
  const system = [
    "You are an AI governance analyst writing a short executive summary for a",
    "Chief AI Officer on how the organization's AI tools are actually being",
    "used. One tight paragraph, aggregate only, no identifiers.",
    "",
    'Respond with STRICT JSON only: { "execSummary": string }.',
  ].join("\n");

  const clusterLines = clusters
    .map((c) => `- ${c.label} (${c.count} records)`)
    .join("\n");
  const outcomes = Object.entries(stats.byOutcome)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const user = [
    `Total consented invocations analyzed: ${stats.total}`,
    `Distinct actors (de-identified count): ${stats.distinctActors}`,
    `Outcome breakdown: ${outcomes || "none"}`,
    `Clustered: ${stats.clusteredCount}; long-tail: ${stats.longTailCount}`,
    "",
    "Usage themes:",
    clusterLines || "- (no themes above the k-anonymity floor)",
  ].join("\n");

  return { system, user };
}
