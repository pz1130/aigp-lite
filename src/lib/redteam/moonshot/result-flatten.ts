import type { MoonshotRawResultRow, MoonshotRawResult } from "./mapper";
import { deriveSeverity } from "./severity";

// Real shape pinned by a live sidecar run (docs/moonshot-real-api-contract.md, Op 4).
// `GET /api/v1/benchmarks/results/{runner_id}` returns the web-format ResultArguments:
//
//   { metadata: { status, recipes, ... },
//     results: { recipes: [ { id, details: [ { model_id, dataset_id, data: [
//       { prompt, predicted_result: { response, context }, target, duration } ] } ],
//       evaluation_summary, ... } ] } }
//
// Per-prompt predictions live at results.recipes[].details[].data[].
// `predicted_result` is SINGULAR and is a ConnectorResponse object `{ response, context }`
// (older/string forms are tolerated defensively). There is NO per-prompt pass/fail in the
// data points (verdicts are aggregate, under details[].metrics), so `passed` defaults to
// true. The data points carry no token usage, so input/output tokens default to 0.

export type MoonshotPrediction =
  | string
  | {
      response?: string;
      context?: unknown[];
      tokens?: { input?: number; output?: number };
    }
  | null
  | undefined;

export interface MoonshotDataPoint {
  prompt?: string;
  predicted_result?: MoonshotPrediction;
  predicted_results?: MoonshotPrediction;
  target?: string;
  duration?: number;
  passed?: boolean;
  score?: number;
}

export interface MoonshotRecipeDetail {
  model_id?: string;
  dataset_id?: string;
  prompt_template_id?: string;
  data?: MoonshotDataPoint[];
}

export interface MoonshotRecipeResult {
  id: string;
  details?: MoonshotRecipeDetail[];
}

export interface MoonshotRunArtifact {
  metadata?: { status?: string; recipes?: string[] };
  results?: { recipes?: MoonshotRecipeResult[] };
}

function predictionOf(p: MoonshotDataPoint): MoonshotPrediction {
  return p.predicted_result ?? p.predicted_results;
}

function responseText(p: MoonshotDataPoint): string {
  const pred = predictionOf(p);
  if (typeof pred === "string") return pred;
  if (pred && typeof pred === "object") return pred.response ?? "";
  return "";
}

function tokensOf(p: MoonshotDataPoint): { input: number; output: number } {
  const pred = predictionOf(p);
  if (pred && typeof pred === "object" && pred.tokens) {
    return { input: pred.tokens.input ?? 0, output: pred.tokens.output ?? 0 };
  }
  return { input: 0, output: 0 };
}

export function flattenArtifact(
  artifact: MoonshotRunArtifact,
): MoonshotRawResultRow[] {
  const rows: MoonshotRawResultRow[] = [];
  for (const recipe of artifact.results?.recipes ?? []) {
    const recipeId = recipe.id;
    let i = 0;
    for (const detail of recipe.details ?? []) {
      for (const p of detail.data ?? []) {
        const tok = tokensOf(p);
        rows.push({
          prompt_id: `${recipeId}#${i}`,
          prompt: p.prompt ?? "",
          response: responseText(p),
          passed: typeof p.passed === "boolean" ? p.passed : true,
          category: recipeId,
          severity: deriveSeverity(recipeId, p.score),
          duration_ms: Math.round((p.duration ?? 0) * 1000),
          input_tokens: tok.input,
          output_tokens: tok.output,
        });
        i++;
      }
    }
  }
  return rows;
}

export function toRawResult(artifact: MoonshotRunArtifact): MoonshotRawResult {
  return { results: flattenArtifact(artifact) };
}
