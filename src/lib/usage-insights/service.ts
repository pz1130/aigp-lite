import { prisma } from "@/lib/db";
import type {
  Prisma,
  UsageInsightReport,
  UsageInsightCluster,
} from "@/lib/prisma";
import { getUsageInsightsConfig } from "./config";
import {
  clusterByEmbedding,
  groupByToolName,
  type RawCluster,
} from "./cluster";
import {
  computeStats,
  computeDeltas,
  type StatsInput,
  type UsageStats,
} from "./stats";
import {
  buildClusterSystemPrompt,
  buildClusterUserMessage,
  buildExecSummaryPrompt,
  type ClusterPromptRow,
} from "./prompt";
import {
  clusterOutputSchema,
  execSummarySchema,
  type UsageDiagnostic,
} from "./schema";
import { scrubText } from "./scrub";
import { embedText } from "@/lib/incidents/embed";
import { isRcaEnabled } from "@/lib/incident-rca/config";
import { callRcaLlm } from "@/lib/incident-rca/llm-client";

export class UsageInsightsStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageInsightsStateError";
  }
}

type LlmFn = (
  system: string,
  user: string,
) => Promise<{
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  providerType: string;
  model: string;
}>;

interface Deps {
  callLlm?: LlmFn;
  llmEnabled?: () => boolean;
}

const inFlight = new Set<string>();

function stripFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function generateReport(
  args: { orgId: string; userId: string; windowDays?: number },
  deps: Deps = {},
): Promise<{ reportId: string }> {
  if (inFlight.has(args.orgId)) {
    throw new UsageInsightsStateError(
      "A usage-insight report is already generating",
    );
  }
  inFlight.add(args.orgId);
  try {
    return await runGenerate(args, deps);
  } finally {
    inFlight.delete(args.orgId);
  }
}

interface CorpusRow {
  id: string;
  toolName: string;
  outcome: string;
  actorId: string;
  text: string;
  embedding: number[] | null;
}

async function runGenerate(
  args: { orgId: string; userId: string; windowDays?: number },
  deps: Deps,
): Promise<{ reportId: string }> {
  const cfg = getUsageInsightsConfig();
  const llmEnabled = deps.llmEnabled ?? isRcaEnabled;
  const callLlm = deps.callLlm ?? callRcaLlm;
  const diagnostics: UsageDiagnostic[] = [];
  const maxInvocations = Math.max(cfg.maxInvocations, 1);
  const k = Math.max(cfg.minClusterSize, 1);

  const windowEnd = new Date();
  const windowStart = new Date(
    windowEnd.getTime() -
      Math.max(args.windowDays ?? cfg.windowDays, 1) * 86400000,
  );

  let invocations = await prisma.mcpToolInvocation.findMany({
    where: {
      orgId: args.orgId,
      consentGiven: true,
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      toolName: true,
      outcome: true,
      actorId: true,
      inputSummary: true,
      outputSummary: true,
    },
  });

  if (invocations.length > maxInvocations) {
    invocations = invocations.slice(-maxInvocations);
    diagnostics.push({
      code: "corpus_capped",
      message: `Analyzed the ${maxInvocations} most recent consented invocations`,
    });
  }
  if (invocations.length === 0) {
    diagnostics.push({
      code: "no_consented_data",
      message: "No consented invocations in window",
    });
  } else if (invocations.length < cfg.insufficientDataFloor) {
    diagnostics.push({
      code: "insufficient_data",
      message: `Only ${invocations.length} consented invocations (floor ${cfg.insufficientDataFloor})`,
    });
  }

  const corpus: CorpusRow[] = invocations.map((r) => ({
    id: r.id,
    toolName: r.toolName,
    outcome: r.outcome,
    actorId: r.actorId,
    text: scrubText(`${r.inputSummary ?? ""}\n${r.outputSummary ?? ""}`.trim()),
    embedding: null,
  }));

  const withEmbedding: { id: string; embedding: number[] }[] = [];
  let unembeddable = 0;
  for (const row of corpus) {
    if (!row.text) {
      unembeddable++;
      continue;
    }
    const emb = await embedText(args.orgId, row.text);
    if (emb) {
      row.embedding = emb;
      withEmbedding.push({ id: row.id, embedding: emb });
    } else {
      unembeddable++;
    }
  }
  if (unembeddable > 0) {
    diagnostics.push({
      code: "unembeddable_invocations",
      message: `${unembeddable} invocations could not be embedded`,
    });
  }

  let rawClusters: RawCluster[];
  if (withEmbedding.length === 0 && corpus.length > 0) {
    diagnostics.push({
      code: "embedding_fallback",
      message: "No embeddings available; grouped by tool name",
    });
    rawClusters = groupByToolName(
      corpus.map((c) => ({ id: c.id, toolName: c.toolName })),
      { minClusterSize: k },
    );
  } else {
    rawClusters = clusterByEmbedding(withEmbedding, {
      threshold: cfg.clusterThreshold,
      minClusterSize: k,
    });
  }

  const byId = new Map(corpus.map((c) => [c.id, c]));
  const narrated = rawClusters.filter((c) => !c.isLongTail);
  const longTail = rawClusters.find((c) => c.isLongTail);
  const clusteredCount = narrated.reduce((n, c) => n + c.memberIds.length, 0);
  const longTailCount = longTail?.memberIds.length ?? 0;
  const suppressedClusterCount =
    withEmbedding.length === 0
      ? countSuppressedByTool(corpus, k)
      : longTailCount > 0
        ? 1
        : 0;

  const statsInput: StatsInput[] = corpus.map((c) => ({
    toolName: c.toolName,
    outcome: c.outcome,
    actorId: c.actorId,
  }));
  const stats = computeStats(statsInput, { clusteredCount, longTailCount });
  const priorPublished = await prisma.usageInsightReport.findFirst({
    where: { orgId: args.orgId, status: "published" },
    orderBy: { version: "desc" },
  });
  const priorStats = priorPublished
    ? (priorPublished.statsJson as unknown as UsageStats)
    : null;
  const deltas = computeDeltas(stats, priorStats);

  let totalIn = 0,
    totalOut = 0,
    totalLat = 0;
  let providerType = "unknown",
    model = "unknown";
  const enabled = llmEnabled();
  if (!enabled) {
    diagnostics.push({
      code: "llm_unavailable",
      message:
        "LLM not configured; clusters and stats produced without narrative",
    });
  }

  type Built = {
    raw: RawCluster;
    label: string;
    narrative: string;
    systemicObservation: string;
    confidence: string;
    invocationCount: number;
    distinctActorCount: number;
    topToolNames: { toolName: string; count: number }[];
    outcomeBreakdown: Record<string, number>;
  };

  const built: Built[] = [];
  for (const c of narrated) {
    const members = c.memberIds.map((id) => byId.get(id)!).filter(Boolean);
    const agg = aggregate(members);
    let label = "",
      narrative = "",
      systemicObservation = "",
      confidence = "";
    if (enabled) {
      const rows: ClusterPromptRow[] = members.map((m) => ({
        text: m.text,
        toolName: m.toolName,
        outcome: m.outcome,
      }));
      try {
        const res = await callLlm(
          buildClusterSystemPrompt(),
          buildClusterUserMessage(rows),
        );
        totalIn += res.inputTokens;
        totalOut += res.outputTokens;
        totalLat += res.latencyMs;
        providerType = res.providerType;
        model = res.model;
        const parsed = clusterOutputSchema.parse(
          JSON.parse(stripFence(res.rawText)),
        );
        label = parsed.label;
        narrative = parsed.narrative;
        systemicObservation = parsed.systemicObservation;
        confidence = parsed.confidence;
      } catch (err) {
        diagnostics.push({
          code: "cluster_llm_failed",
          message: String((err as Error).message ?? err).slice(0, 280),
        });
      }
    }
    built.push({
      raw: c,
      label,
      narrative,
      systemicObservation,
      confidence,
      ...agg,
    });
  }

  let execSummary = "";
  if (enabled && built.length > 0) {
    try {
      const { system, user } = buildExecSummaryPrompt(
        built.map((b) => ({ label: b.label, count: b.invocationCount })),
        stats,
      );
      const res = await callLlm(system, user);
      totalIn += res.inputTokens;
      totalOut += res.outputTokens;
      totalLat += res.latencyMs;
      execSummary = execSummarySchema.parse(
        JSON.parse(stripFence(res.rawText)),
      ).execSummary;
    } catch (err) {
      diagnostics.push({
        code: "exec_summary_failed",
        message: String((err as Error).message ?? err).slice(0, 280),
      });
    }
  }

  const maxVersion = await prisma.usageInsightReport.findFirst({
    where: { orgId: args.orgId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const report = await prisma.usageInsightReport.create({
    data: {
      orgId: args.orgId,
      version: (maxVersion?.version ?? 0) + 1,
      status: "draft",
      windowStart,
      windowEnd,
      k,
      statsJson: stats as unknown as Prisma.InputJsonValue,
      deltaJson: deltas as unknown as Prisma.InputJsonValue,
      execSummary,
      diagnostics: diagnostics as unknown as Prisma.InputJsonValue,
      providerType,
      model,
      inputTokens: totalIn,
      outputTokens: totalOut,
      latencyMs: totalLat,
      totalInvocations: corpus.length,
      clusterCount: built.length,
      suppressedClusterCount,
      generatedById: args.userId,
      clusters: {
        create: [
          ...built.map((b) => ({
            orgId: args.orgId,
            themeLabel: b.label,
            narrative: b.narrative,
            systemicObservation: b.systemicObservation,
            confidence: b.confidence,
            invocationCount: b.invocationCount,
            distinctActorCount: b.distinctActorCount,
            topToolNames: b.topToolNames as unknown as Prisma.InputJsonValue,
            outcomeBreakdown:
              b.outcomeBreakdown as unknown as Prisma.InputJsonValue,
            isLongTail: false,
          })),
          ...(longTail
            ? [
                {
                  orgId: args.orgId,
                  themeLabel: "",
                  narrative: "",
                  systemicObservation: "",
                  confidence: "",
                  invocationCount: longTail.memberIds.length,
                  distinctActorCount: new Set(
                    longTail.memberIds.map((id) => byId.get(id)!.actorId),
                  ).size,
                  topToolNames: [] as unknown as Prisma.InputJsonValue,
                  outcomeBreakdown: {} as unknown as Prisma.InputJsonValue,
                  isLongTail: true,
                },
              ]
            : []),
        ],
      },
    },
  });

  return { reportId: report.id };
}

function aggregate(members: CorpusRow[]): {
  invocationCount: number;
  distinctActorCount: number;
  topToolNames: { toolName: string; count: number }[];
  outcomeBreakdown: Record<string, number>;
} {
  const tool = new Map<string, number>();
  const outcome: Record<string, number> = {};
  const actors = new Set<string>();
  for (const m of members) {
    tool.set(m.toolName, (tool.get(m.toolName) ?? 0) + 1);
    outcome[m.outcome] = (outcome[m.outcome] ?? 0) + 1;
    actors.add(m.actorId);
  }
  const topToolNames = [...tool.entries()]
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count || a.toolName.localeCompare(b.toolName))
    .slice(0, 5);
  return {
    invocationCount: members.length,
    distinctActorCount: actors.size,
    topToolNames,
    outcomeBreakdown: outcome,
  };
}

function countSuppressedByTool(corpus: CorpusRow[], k: number): number {
  const counts = new Map<string, number>();
  for (const c of corpus)
    counts.set(c.toolName, (counts.get(c.toolName) ?? 0) + 1);
  let n = 0;
  for (const v of counts.values()) if (v < k) n++;
  return n;
}

async function loadOwn(orgId: string, id: string): Promise<UsageInsightReport> {
  const row = await prisma.usageInsightReport.findFirst({
    where: { id, orgId },
  });
  if (!row)
    throw new UsageInsightsStateError(`Usage report ${id} not found in org`);
  return row;
}

export async function publishReport(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<UsageInsightReport> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new UsageInsightsStateError(
      `Report ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  return prisma.$transaction(async (tx) => {
    await tx.usageInsightReport.updateMany({
      where: { orgId: args.orgId, status: "published" },
      data: { status: "superseded" },
    });
    return tx.usageInsightReport.update({
      where: { id: args.id },
      data: { status: "published", publishedAt: new Date() },
    });
  });
}

export async function listReports(
  orgId: string,
): Promise<UsageInsightReport[]> {
  return prisma.usageInsightReport.findMany({
    where: { orgId },
    orderBy: { version: "desc" },
  });
}

export async function getReport(
  orgId: string,
  id: string,
): Promise<{ report: UsageInsightReport; clusters: UsageInsightCluster[] }> {
  const report = await loadOwn(orgId, id);
  const clusters = await prisma.usageInsightCluster.findMany({
    where: { orgId, reportId: id },
    orderBy: [{ isLongTail: "asc" }, { invocationCount: "desc" }],
  });
  return { report, clusters };
}
