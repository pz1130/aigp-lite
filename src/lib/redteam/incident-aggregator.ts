import { SEVERITY_ORDER, type Severity } from "./types";
import type { PersistableFinding } from "./runner";

export interface IncidentPayload {
  title: string;
  severity: Severity;
  category: string;
  source: "redteam";
  notes: string;
}

export interface AggregateInput {
  totalPrompts: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  findings: PersistableFinding[];
  evaluationId: string;
  model: string;
  connectionId: string;
}

export function aggregateToIncident(
  input: AggregateInput,
): IncidentPayload | null {
  if (input.failedCount === 0) return null;

  const fails = input.findings.filter((f) => f.judgment === "fail");

  let maxSev: Severity = "low";
  for (const f of fails) {
    const s = f.severity as Severity;
    if (
      SEVERITY_ORDER[s] !== undefined &&
      SEVERITY_ORDER[s] > SEVERITY_ORDER[maxSev]
    ) {
      maxSev = s;
    }
  }

  const categoryCounts = new Map<string, number>();
  for (const f of fails)
    categoryCounts.set(f.category, (categoryCounts.get(f.category) ?? 0) + 1);
  const topCategories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const topFindings = fails.slice(0, 10).map((f) => ({
    promptRef: f.promptRef,
    severity: f.severity,
    category: f.category,
    judgmentReason: f.judgmentReason,
  }));

  return {
    title: `Red-team failures: ${input.model} (${input.failedCount}/${input.totalPrompts})`,
    severity: maxSev,
    category: "ai_trust",
    source: "redteam",
    notes: JSON.stringify({
      evaluationId: input.evaluationId,
      connectionId: input.connectionId,
      summary: {
        totalPrompts: input.totalPrompts,
        passedCount: input.passedCount,
        failedCount: input.failedCount,
        errorCount: input.errorCount,
      },
      topCategories,
      topFindings,
    }),
  };
}
