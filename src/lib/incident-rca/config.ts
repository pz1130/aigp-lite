export type RcaProviderKind = "anthropic" | "openai" | "google";

export type RcaConfig = {
  kind: RcaProviderKind;
  apiKey: string;
  model: string;
};

const VALID: RcaProviderKind[] = ["anthropic", "openai", "google"];

export function isRcaEnabled(): boolean {
  const p = process.env.INCIDENT_RCA_PROVIDER;
  const k = process.env.INCIDENT_RCA_API_KEY;
  const m = process.env.INCIDENT_RCA_MODEL;
  return Boolean(p && k && m && VALID.includes(p as RcaProviderKind));
}

export function getRcaConfig(): RcaConfig {
  if (!isRcaEnabled()) {
    throw new Error(
      "INCIDENT_RCA not configured: set INCIDENT_RCA_PROVIDER, INCIDENT_RCA_API_KEY, INCIDENT_RCA_MODEL",
    );
  }
  return {
    kind: process.env.INCIDENT_RCA_PROVIDER as RcaProviderKind,
    apiKey: process.env.INCIDENT_RCA_API_KEY!,
    model: process.env.INCIDENT_RCA_MODEL!,
  };
}
