import { prisma } from "@/lib/db";
import {
  callTargetModel,
  PROVIDER_TYPE_MAP,
  BASE_URLS,
} from "@/lib/eval/target-call";
import { getJudgeProvider } from "@/lib/drift/config";
import { getAdapter } from "@/lib/runtime/providers/registry";
import type { AdapterStreamOpts } from "@/lib/runtime/providers/types";
import { count, distribution } from "@/lib/observability/metrics";
import { evaluateConcern, type ConcernLlmCaller } from "./judge";
import { rollupAudit, type ProbeScore } from "./rollup";

export type RunAuditDeps = {
  callTarget?: typeof callTargetModel;
  callJudge?: ConcernLlmCaller;
};

const defaultJudgeCaller: ConcernLlmCaller = async (system, user) => {
  const cfg = getJudgeProvider();
  const adapter = getAdapter(PROVIDER_TYPE_MAP[cfg.kind]);
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
  return { rawText, inputTokens, outputTokens, latencyMs: Date.now() - start };
};

export async function runAudit(
  auditId: string,
  deps: RunAuditDeps = {},
): Promise<void> {
  const callTarget = deps.callTarget ?? callTargetModel;
  const callJudge = deps.callJudge ?? defaultJudgeCaller;

  const audit = await prisma.alignmentAudit.findUnique({
    where: { id: auditId },
  });
  if (!audit) throw new Error(`AlignmentAudit not found: ${auditId}`);

  const probes = await prisma.alignmentProbe.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  await prisma.alignmentResult.deleteMany({ where: { auditId } });
  await prisma.alignmentAudit.update({
    where: { id: auditId },
    data: {
      status: "running",
      completedCount: 0,
      outcome: null,
      worstDimension: null,
      maxConcernScore: null,
      completedAt: null,
      errorMessage: null,
    },
  });

  const scores: ProbeScore[] = [];
  let completed = 0;

  try {
    for (const probe of probes) {
      try {
        const target = await callTarget(
          audit.targetProvider,
          audit.targetModel,
          probe.promptText,
        );
        const judged = await evaluateConcern(
          {
            dimension: probe.dimension,
            promptText: probe.promptText,
            expectedBehavior: probe.expectedBehavior,
            concernGuidance: probe.concernGuidance,
          },
          target.text,
          callJudge,
        );
        await prisma.alignmentResult.create({
          data: {
            auditId,
            probeId: probe.id,
            orgId: audit.orgId,
            dimension: probe.dimension,
            actualOutput: target.text,
            concernScore: judged.concernScore,
            judgment: judged.judgment,
            errored: judged.errored,
            targetLatencyMs: target.latencyMs,
            targetTokens: target.inputTokens + target.outputTokens,
            judgeLatencyMs: judged.tokens.latencyMs,
            judgeTokens: judged.tokens.input + judged.tokens.output,
          },
        });
        scores.push({
          dimension: probe.dimension,
          concernScore: judged.concernScore,
          errored: judged.errored,
        });
      } catch (err) {
        await prisma.alignmentResult.create({
          data: {
            auditId,
            probeId: probe.id,
            orgId: audit.orgId,
            dimension: probe.dimension,
            actualOutput: "",
            concernScore: 0,
            judgment: `Error: ${err instanceof Error ? err.message : String(err)}`,
            errored: true,
          },
        });
        scores.push({
          dimension: probe.dimension,
          concernScore: 0,
          errored: true,
        });
      }
      completed += 1;
      await prisma.alignmentAudit.update({
        where: { id: auditId },
        data: { completedCount: completed },
      });
    }

    const rollup = rollupAudit(
      scores,
      audit.warnThreshold,
      audit.concernThreshold,
    );
    await prisma.alignmentAudit.update({
      where: { id: auditId },
      data: {
        status: "completed",
        outcome: rollup.outcome,
        worstDimension: rollup.worstDimension,
        maxConcernScore: rollup.maxConcernScore,
        completedAt: new Date(),
      },
    });
    count("alignment_audit.outcome", { outcome: rollup.outcome });
    distribution("alignment_audit.max_concern", rollup.maxConcernScore);
  } catch (err) {
    await prisma.alignmentAudit.update({
      where: { id: auditId },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
  }
}
