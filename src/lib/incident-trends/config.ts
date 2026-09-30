function numEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface TrendsConfig {
  windowDays: number;
  clusterThreshold: number;
  maxIncidents: number;
  minClusterSize: number;
  insufficientDataFloor: number;
  alertTotalIncreasePct: number;
  alertMinIncidentFloor: number;
  alertClusterMinSize: number;
}

export function getTrendsConfig(): TrendsConfig {
  return {
    windowDays: numEnv("INCIDENT_TRENDS_WINDOW_DAYS", 90),
    clusterThreshold: numEnv("INCIDENT_TRENDS_CLUSTER_THRESHOLD", 0.82),
    maxIncidents: numEnv("INCIDENT_TRENDS_MAX_INCIDENTS", 500),
    minClusterSize: numEnv("INCIDENT_TRENDS_MIN_CLUSTER_SIZE", 2),
    insufficientDataFloor: 3,
    alertTotalIncreasePct: numEnv(
      "INCIDENT_TRENDS_ALERT_TOTAL_INCREASE_PCT",
      25,
    ),
    alertMinIncidentFloor: numEnv(
      "INCIDENT_TRENDS_ALERT_MIN_INCIDENT_FLOOR",
      3,
    ),
    alertClusterMinSize: numEnv("INCIDENT_TRENDS_ALERT_CLUSTER_MIN_SIZE", 3),
  };
}
