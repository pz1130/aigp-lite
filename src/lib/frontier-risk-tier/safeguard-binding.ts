/** Cumulative escalating ladder — seeded default; org overrides are a fast-follow. */
export const DEFAULT_BINDING: Record<number, string[]> = {
  1: ["redteam"],
  2: ["redteam", "external_redteam", "fria"],
  3: ["redteam", "external_redteam", "fria", "drift", "human_oversight"],
};

const MAX_DEFINED_TIER = Math.max(
  ...Object.keys(DEFAULT_BINDING).map((k) => Number(k)),
);

/** Union of blocking check-ids required at the given effective tier. */
export function requiredBlockingChecks(tier: number | null): Set<string> {
  if (tier === null || tier === 0) return new Set();
  const lookup = tier > MAX_DEFINED_TIER ? MAX_DEFINED_TIER : tier;
  return new Set(DEFAULT_BINDING[lookup] ?? []);
}
