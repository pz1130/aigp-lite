import type { MaterialityTier } from "@/lib/prisma";
import { effectiveTier } from "@/lib/materiality/rubric";

export const REQUIRED_TIERS = new Set<MaterialityTier>(["high", "critical"]);

export interface MaterialityLite {
  computedTier: MaterialityTier;
  tierOverride: MaterialityTier | null;
}

export function isFairnessRequired(m: MaterialityLite | null): boolean {
  if (m == null) return false;
  return REQUIRED_TIERS.has(effectiveTier(m));
}

export interface FairnessReqState {
  required: boolean;
  tier: MaterialityTier | null;
}

export function fairnessReqState(m: MaterialityLite | null): FairnessReqState {
  if (m == null) return { required: false, tier: null };
  const tier = effectiveTier(m);
  return { required: REQUIRED_TIERS.has(tier), tier };
}
