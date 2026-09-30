import type { AutonomyLevel, MaterialityTier } from "@/lib/prisma";

export interface MaterialityInputs {
  affectedParties: number;
  decisionConsequence: number;
  financialSafety: number;
  dataSensitivity: number;
}

export type ImpactDimensionKey = keyof MaterialityInputs;

export const IMPACT_DIMENSIONS: ReadonlyArray<{
  key: ImpactDimensionKey;
  label: string;
  options: [string, string, string, string];
}> = [
  {
    key: "affectedParties",
    label: "Affected parties",
    options: [
      "Internal team only",
      "Internal org-wide",
      "External customers",
      "Public / vulnerable groups",
    ],
  },
  {
    key: "decisionConsequence",
    label: "Decision consequence",
    options: [
      "Advisory only",
      "Influences a human decision",
      "Automates a reversible decision",
      "Automates a consequential/irreversible decision",
    ],
  },
  {
    key: "financialSafety",
    label: "Financial / safety impact",
    options: [
      "Negligible",
      "Moderate",
      "Significant",
      "Severe / safety-critical",
    ],
  },
  {
    key: "dataSensitivity",
    label: "Data sensitivity",
    options: [
      "Public / non-personal",
      "Internal",
      "Personal data",
      "Special-category / regulated",
    ],
  },
];

const AUTONOMY_BAND: Record<AutonomyLevel, number> = {
  assistant: 0,
  simple_agent: 1,
  collaborative_agent: 2,
  agent_ecosystem: 3,
};

export function autonomyBand(level: AutonomyLevel): number {
  return AUTONOMY_BAND[level];
}

export function impactBand(inputs: MaterialityInputs): number {
  return Math.max(
    inputs.affectedParties,
    inputs.decisionConsequence,
    inputs.financialSafety,
    inputs.dataSensitivity,
  );
}

export const TIER_MATRIX: MaterialityTier[][] = [
  ["minimal", "minimal", "limited", "limited"],
  ["minimal", "limited", "limited", "high"],
  ["limited", "high", "high", "critical"],
  ["high", "high", "critical", "critical"],
];

export const TIER_WEIGHT: Record<MaterialityTier, number> = {
  minimal: 1,
  limited: 2,
  high: 4,
  critical: 8,
};

export function computeTier(
  inputs: MaterialityInputs,
  autonomyLevel: AutonomyLevel,
): { tier: MaterialityTier; impactBand: number; autonomyBand: number } {
  const ib = impactBand(inputs);
  const ab = autonomyBand(autonomyLevel);
  return { tier: TIER_MATRIX[ib][ab], impactBand: ib, autonomyBand: ab };
}

export function effectiveTier(m: {
  computedTier: MaterialityTier;
  tierOverride: MaterialityTier | null;
}): MaterialityTier {
  return m.tierOverride ?? m.computedTier;
}
