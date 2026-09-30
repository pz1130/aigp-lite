export function isDriftEnabled(): boolean {
  return process.env.AIGP_DRIFT_ENABLED === "true";
}

export type JudgeProviderConfig =
  | { kind: "anthropic"; apiKey: string; model: string }
  | { kind: "openai"; apiKey: string; model: string }
  | { kind: "google"; apiKey: string; model: string };

export function getJudgeProvider(): JudgeProviderConfig {
  const kind = process.env.AIGP_DRIFT_JUDGE_PROVIDER ?? "anthropic";
  switch (kind) {
    case "anthropic":
      return {
        kind: "anthropic",
        apiKey: requireEnv("AIGP_DRIFT_JUDGE_ANTHROPIC_KEY"),
        model:
          process.env.AIGP_DRIFT_JUDGE_ANTHROPIC_MODEL ??
          "claude-haiku-4-5-20251001",
      };
    case "openai":
      return {
        kind: "openai",
        apiKey: requireEnv("AIGP_DRIFT_JUDGE_OPENAI_KEY"),
        model: process.env.AIGP_DRIFT_JUDGE_OPENAI_MODEL ?? "gpt-4o-mini",
      };
    case "google":
      return {
        kind: "google",
        apiKey: requireEnv("AIGP_DRIFT_JUDGE_GOOGLE_KEY"),
        model: process.env.AIGP_DRIFT_JUDGE_GOOGLE_MODEL ?? "gemini-2.5-flash",
      };
    default:
      throw new Error(`Unknown AIGP_DRIFT_JUDGE_PROVIDER: ${kind}`);
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`${name} is required when drift monitoring is enabled`);
  return v;
}
