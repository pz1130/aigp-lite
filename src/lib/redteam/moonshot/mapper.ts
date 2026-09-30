import type { PersistableFinding } from "../runner";

export interface MoonshotRawResultRow {
  prompt_id: string;
  prompt: string;
  response: string;
  passed: boolean;
  category: string;
  severity: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
}
export interface MoonshotRawResult {
  results: MoonshotRawResultRow[];
}

export function mapMoonshotResults(
  raw: MoonshotRawResult,
): PersistableFinding[] {
  return raw.results.map((r) => ({
    promptRef: `moonshot:${r.prompt_id}`,
    promptText: r.prompt,
    category: r.category,
    severity: r.severity,
    response: r.response,
    judgment: r.passed ? ("pass" as const) : ("fail" as const),
    judgmentReason: r.passed
      ? "Moonshot metric passed."
      : "Moonshot metric failed.",
    latencyMs: r.duration_ms,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
  }));
}
