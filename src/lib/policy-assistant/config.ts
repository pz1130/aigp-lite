export function isAssistantEnabled(): boolean {
  return process.env.AIGP_ASSISTANT_ENABLED === "true";
}

export function getDailyLimit(): number {
  const raw = process.env.AIGP_ASSISTANT_DAILY_LIMIT;
  const n = raw ? parseInt(raw, 10) : 20;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export type AssistantProviderConfig =
  | { kind: "anthropic"; apiKey: string; model: string }
  | { kind: "openai"; apiKey: string; model: string }
  | { kind: "google"; apiKey: string; model: string };

export function getAssistantProvider(): AssistantProviderConfig {
  const kind = process.env.AIGP_ASSISTANT_PROVIDER ?? "anthropic";
  switch (kind) {
    case "anthropic":
      return {
        kind: "anthropic",
        apiKey: requireEnv("AIGP_ASSISTANT_ANTHROPIC_KEY"),
        model:
          process.env.AIGP_ASSISTANT_ANTHROPIC_MODEL ??
          "claude-haiku-4-5-20251001",
      };
    case "openai":
      return {
        kind: "openai",
        apiKey: requireEnv("AIGP_ASSISTANT_OPENAI_KEY"),
        model: process.env.AIGP_ASSISTANT_OPENAI_MODEL ?? "gpt-4o-mini",
      };
    case "google":
      return {
        kind: "google",
        apiKey: requireEnv("AIGP_ASSISTANT_GOOGLE_KEY"),
        model: process.env.AIGP_ASSISTANT_GOOGLE_MODEL ?? "gemini-2.5-flash",
      };
    default:
      throw new Error(`Unknown AIGP_ASSISTANT_PROVIDER: ${kind}`);
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required when assistant is enabled`);
  return v;
}
