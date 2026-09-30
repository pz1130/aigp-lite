import { getChecker } from "./checkers";
import type { UnifiedPrompt, CheckerResult } from "./types";

export interface ModelCallResult {
  response: string;
  usage: { input: number; output: number };
  latencyMs: number;
}

export interface RunDeps {
  callModel: (prompt: UnifiedPrompt) => Promise<ModelCallResult>;
  signal: () => boolean | Promise<boolean>;
  // Optional override for the judgment step. Defaults to the built-in
  // keyword checker selected by the prompt's `checker` slug.
  judge?: (
    prompt: UnifiedPrompt,
    response: string,
  ) => CheckerResult | Promise<CheckerResult>;
}

export interface PersistableFinding {
  promptRef: string;
  promptText: string;
  category: string;
  severity: string;
  response: string;
  judgment: "pass" | "fail" | "error";
  judgmentReason: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RunSummary {
  totalPrompts: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
}

export type RunEvent =
  | { type: "started"; totalPrompts: number }
  | { type: "finding"; finding: PersistableFinding }
  | {
      type: "progress";
      completed: number;
      passed: number;
      failed: number;
      error: number;
    }
  | { type: "done"; summary: RunSummary };

export interface RunOpts {
  batchSize: number;
  // onEvent may be async (e.g. persist a finding before sending the SSE
  // frame); awaiting prevents the caller from closing the stream before
  // queued work lands.
  onEvent: (e: RunEvent) => void | Promise<void>;
}

export async function runEvaluation(
  prompts: UnifiedPrompt[],
  deps: RunDeps,
  opts: RunOpts,
): Promise<void> {
  await opts.onEvent({ type: "started", totalPrompts: prompts.length });

  let completed = 0;
  let passed = 0;
  let failed = 0;
  let error = 0;

  for (let i = 0; i < prompts.length; i += opts.batchSize) {
    if (await deps.signal()) break;

    const batch = prompts.slice(i, i + opts.batchSize);
    const results = await Promise.all(
      batch.map(async (p): Promise<PersistableFinding> => {
        try {
          const r = await deps.callModel(p);
          const check = deps.judge
            ? await deps.judge(p, r.response)
            : getChecker(p.checker)(p.text, r.response);
          return {
            promptRef: p.ref,
            promptText: p.text,
            category: p.category,
            severity: p.severity,
            response: r.response.slice(0, 4096),
            judgment: check.judgment,
            judgmentReason: check.reason,
            latencyMs: r.latencyMs,
            inputTokens: r.usage.input,
            outputTokens: r.usage.output,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            promptRef: p.ref,
            promptText: p.text,
            category: p.category,
            severity: p.severity,
            response: "",
            judgment: "error",
            judgmentReason: msg.slice(0, 200),
            latencyMs: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
        }
      }),
    );

    for (const f of results) {
      if (f.judgment === "pass") passed++;
      else if (f.judgment === "fail") failed++;
      else error++;
      await opts.onEvent({ type: "finding", finding: f });
    }
    completed += results.length;
    await opts.onEvent({ type: "progress", completed, passed, failed, error });
  }

  await opts.onEvent({
    type: "done",
    summary: {
      totalPrompts: completed,
      passedCount: passed,
      failedCount: failed,
      errorCount: error,
    },
  });
}
