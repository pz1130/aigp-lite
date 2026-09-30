import { prisma } from "@/lib/db";
import { evaluateWithJudge, type JudgeResult } from "./judge";
import { getJudgeProvider } from "./config";
import { getAdapter } from "@/lib/runtime/providers/registry";
import type { AdapterStreamOpts } from "@/lib/runtime/providers/types";
import { count, distribution } from "@/lib/observability/metrics";
import {
  callTargetModel,
  PROVIDER_TYPE_MAP,
  BASE_URLS,
} from "@/lib/eval/target-call";

async function callJudgeModel(
  promptText: string,
  expectedBehavior: string,
  referenceOutput: string | null,
  actualOutput: string,
): Promise<JudgeResult> {
  const cfg = getJudgeProvider();
  const providerType = PROVIDER_TYPE_MAP[cfg.kind];
  const adapter = getAdapter(providerType);

  return evaluateWithJudge(
    promptText,
    expectedBehavior,
    referenceOutput,
    actualOutput,
    async (system, user) => {
      const opts: AdapterStreamOpts = {
        baseUrl: BASE_URLS[cfg.kind],
        credentials: { apiKey: cfg.apiKey },
        config: {},
        model: cfg.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      const start = Date.now();
      let rawText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of adapter.streamChat(opts)) {
        if (chunk.delta) rawText += chunk.delta;
        if (chunk.usage) {
          inputTokens = chunk.usage.input;
          outputTokens = chunk.usage.output;
        }
      }
      return {
        rawText,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        providerType: cfg.kind,
        model: cfg.model,
      };
    },
  );
}

export async function runBenchmark(runId: string): Promise<void> {
  const run = await prisma.driftRun.findUnique({
    where: { id: runId },
    include: {
      benchmark: { include: { prompts: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!run) throw new Error(`DriftRun not found: ${runId}`);

  // Idempotent restart: a retried/redelivered job must not leave duplicate
  // results or stale aggregates from a prior (crashed) attempt.
  await prisma.driftResult.deleteMany({ where: { runId } });
  await prisma.driftRun.update({
    where: { id: runId },
    data: {
      status: "running",
      completedCount: 0,
      avgScore: null,
      degraded: false,
      completedAt: null,
      errorMessage: null,
    },
  });

  let totalScore = 0;
  let completed = 0;

  try {
    for (const prompt of run.benchmark.prompts) {
      try {
        // Call target model
        const targetResult = await callTargetModel(
          run.targetProvider,
          run.targetModel,
          prompt.promptText,
        );

        // Call judge model
        const judgeResult = await callJudgeModel(
          prompt.promptText,
          prompt.expectedBehavior,
          prompt.referenceOutput,
          targetResult.text,
        );

        await prisma.driftResult.create({
          data: {
            runId,
            promptId: prompt.id,
            orgId: run.orgId,
            actualOutput: targetResult.text,
            score: judgeResult.score,
            judgment: judgeResult.judgment,
            targetLatencyMs: targetResult.latencyMs,
            targetTokens: targetResult.inputTokens + targetResult.outputTokens,
            judgeLatencyMs: judgeResult.tokens.latencyMs,
            judgeTokens: judgeResult.tokens.input + judgeResult.tokens.output,
          },
        });

        totalScore += judgeResult.score;
        completed += 1;

        await prisma.driftRun.update({
          where: { id: runId },
          data: { completedCount: completed },
        });
      } catch (err) {
        // Per-prompt failure: record score=0
        await prisma.driftResult.create({
          data: {
            runId,
            promptId: prompt.id,
            orgId: run.orgId,
            actualOutput: "",
            score: 0,
            judgment: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
        completed += 1;
        await prisma.driftRun.update({
          where: { id: runId },
          data: { completedCount: completed },
        });
      }
    }

    const avgScore = completed > 0 ? totalScore / completed : 0;
    const benchmark = await prisma.driftBenchmark.findUnique({
      where: { id: run.benchmarkId },
      select: { threshold: true },
    });
    const degraded = avgScore < (benchmark?.threshold ?? 7.0);

    await prisma.driftRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        avgScore,
        degraded,
        completedAt: new Date(),
      },
    });

    if (degraded) {
      count("drift.run.degraded");
    } else {
      count("drift.run.completed");
    }
    distribution("drift.run.score", avgScore);
  } catch (err) {
    await prisma.driftRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
  }
}
