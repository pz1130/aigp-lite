export type CopilotProviderKind = "anthropic" | "openai" | "google";

export type CopilotProviderConfig = {
  kind: CopilotProviderKind;
  apiKey: string;
  model: string;
};

const VALID: CopilotProviderKind[] = ["anthropic", "openai", "google"];

export function isCopilotEnabled(): boolean {
  const p = process.env.RISK_COPILOT_PROVIDER;
  const k = process.env.RISK_COPILOT_API_KEY;
  const m = process.env.RISK_COPILOT_MODEL;
  return Boolean(p && k && m && VALID.includes(p as CopilotProviderKind));
}

export function getDailyLimit(): number {
  const raw = process.env.RISK_COPILOT_DAILY_LIMIT;
  if (!raw) return 20;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function getCatalogTokenBudget(): number {
  const raw = process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET;
  if (!raw) return 40000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 40000;
}

export function getCopilotProvider(): CopilotProviderConfig {
  if (!isCopilotEnabled()) {
    throw new Error(
      "RISK_COPILOT not configured: set RISK_COPILOT_PROVIDER, RISK_COPILOT_API_KEY, RISK_COPILOT_MODEL",
    );
  }
  return {
    kind: process.env.RISK_COPILOT_PROVIDER as CopilotProviderKind,
    apiKey: process.env.RISK_COPILOT_API_KEY!,
    model: process.env.RISK_COPILOT_MODEL!,
  };
}
