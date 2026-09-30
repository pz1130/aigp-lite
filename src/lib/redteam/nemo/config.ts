export function isNemoEnabled(): boolean {
  return Boolean(process.env.AIGP_NEMO_URL);
}

export interface NemoConfig {
  baseUrl: string;
  apiKey: string | undefined;
  configId: string;
  timeoutMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getNemoConfig(): NemoConfig {
  const baseUrl = process.env.AIGP_NEMO_URL;
  if (!baseUrl)
    throw new Error(
      "AIGP_NEMO_URL is required when the NeMo guardrails engine is enabled",
    );
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.AIGP_NEMO_API_KEY,
    configId: process.env.AIGP_NEMO_CONFIG_ID || "aigp_judge",
    timeoutMs: intEnv("AIGP_NEMO_TIMEOUT_MS", 60000),
  };
}
