export type AutonomyLevel =
  "assistant" | "simple_agent" | "collaborative_agent" | "agent_ecosystem";
export type ControlSeverity = "low" | "medium" | "high";
export type ControlStatusValue =
  "not_applicable" | "not_started" | "in_progress" | "satisfied" | "failed";
export type RiskLevel = "low" | "medium" | "high";

interface Control {
  id: string;
  status: ControlStatusValue;
  severity: ControlSeverity;
  name: string;
  description: string;
}

interface ScoringResult {
  scoreInt: number;
  level: RiskLevel;
}

const BASE_SCORES: Record<AutonomyLevel, number> = {
  assistant: 10,
  simple_agent: 30,
  collaborative_agent: 60,
  agent_ecosystem: 85,
};

export function scoreUsecase(
  autonomy: AutonomyLevel,
  controls: Control[],
): ScoringResult {
  let score = BASE_SCORES[autonomy];

  // Penalty per failed control: +5 (capped at +30 total)
  const failedCount = controls.filter((c) => c.status === "failed").length;
  const failedPenalty = Math.min(failedCount * 5, 30);
  score += failedPenalty;

  // Bonus per satisfied high-severity control: -2 (capped at -15 total)
  const satisfiedHighCount = controls.filter(
    (c) => c.status === "satisfied" && c.severity === "high",
  ).length;
  const satisfiedBonus = Math.min(satisfiedHighCount * 2, 15);
  score -= satisfiedBonus;

  // Clamp final score 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine level
  const level: RiskLevel = score < 30 ? "low" : score < 70 ? "medium" : "high";

  return { scoreInt: score, level };
}
