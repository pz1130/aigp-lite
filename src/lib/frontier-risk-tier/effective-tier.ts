import type { FrtAnswerStatus } from "./scoring";

export interface EffectiveTier {
  assessed: boolean;
  tier: number | null;
}

/**
 * Derives the ASL-style effective capability tier from FRT answer rows.
 * `answers === null` means no approved assessment exists.
 */
export function deriveEffectiveTier(
  answers: { status: FrtAnswerStatus | string; tier: number }[] | null,
): EffectiveTier {
  if (answers === null) return { assessed: false, tier: null };
  const metTiers = answers.filter((a) => a.status === "met").map((a) => a.tier);
  if (metTiers.length === 0) return { assessed: true, tier: 0 };
  return { assessed: true, tier: Math.max(...metTiers) };
}
