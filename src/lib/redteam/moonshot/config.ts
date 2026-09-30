export function isMoonshotEngineEnabled(): boolean {
  return Boolean(process.env.AIGP_MOONSHOT_URL);
}

export interface MoonshotConfig {
  baseUrl: string;
  apiKey: string | undefined;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getMoonshotConfig(): MoonshotConfig {
  const baseUrl = process.env.AIGP_MOONSHOT_URL;
  if (!baseUrl)
    throw new Error(
      "AIGP_MOONSHOT_URL is required when the Moonshot engine is enabled",
    );
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.AIGP_MOONSHOT_API_KEY,
    pollIntervalMs: intEnv("AIGP_MOONSHOT_POLL_INTERVAL_MS", 2000),
    pollTimeoutMs: intEnv("AIGP_MOONSHOT_POLL_TIMEOUT_MS", 600000),
  };
}
