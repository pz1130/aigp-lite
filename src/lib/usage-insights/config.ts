function numEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface UsageInsightsConfig {
  windowDays: number;
  clusterThreshold: number;
  maxInvocations: number;
  minClusterSize: number;
  insufficientDataFloor: number;
}

export function getUsageInsightsConfig(): UsageInsightsConfig {
  return {
    windowDays: numEnv("USAGE_INSIGHTS_WINDOW_DAYS", 90),
    clusterThreshold: numEnv("USAGE_INSIGHTS_CLUSTER_THRESHOLD", 0.82),
    maxInvocations: numEnv("USAGE_INSIGHTS_MAX_INVOCATIONS", 2000),
    minClusterSize: numEnv("USAGE_INSIGHTS_MIN_CLUSTER_SIZE", 5),
    insufficientDataFloor: numEnv("USAGE_INSIGHTS_INSUFFICIENT_FLOOR", 5),
  };
}
