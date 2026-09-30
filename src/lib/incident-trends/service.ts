import { prisma } from "@/lib/db";
import type {
  Prisma,
  IncidentTrendReport,
  IncidentTrendCluster,
  IncidentCategory,
  IncidentSeverity,
} from "@/lib/prisma";
import { getTrendsConfig } from "./config";
import {
  clusterByEmbedding,
  groupByCategorySeverity,
  type RawCluster,
} from "./cluster";
import { computeStats, computeDeltas, type StatsInput } from "./stats";
import {
  buildClusterSystemPrompt,
  buildClusterUserMessage,
  buildExecSummaryPrompt,
  type ClusterPromptIncident,
} from "./prompt";
import { clusterOutputSchema, execSummarySchema } from "./schema";
import type { TrendDiagnostic } from "./schema";
import { embedText } from "@/lib/incidents/embed";
import { isRcaEnabled } from "@/lib/incident-rca/config";
import { callRcaLlm } from "@/lib/incident-rca/llm-client";
import { workflowEvents } from "@/lib/events/workflow-bus";
import { evaluateTrendAlerts } from "./alerts";
import type { TrendStats, TrendDeltas } from "./stats";

export class IncidentTrendsStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncidentTrendsStateError";
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

/** In-flight lock: one generate per org at a time. */
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
    throw new IncidentTrendsStateError("A trend report is already generating");
  }
  inFlight.add(args.orgId);
  try {
    return await runGenerate(args, deps);
  } finally {
    inFlight.delete(args.orgId);
  }
}

async function runGenerate(
  args: { orgId: string; userId: string; windowDays?: number },
  deps: Deps,
): Promise<{ reportId: string }> {
  const cfg = getTrendsConfig();
  const llmEnabled = deps.llmEnabled ?? isRcaEnabled;
  const callLlm = deps.callLlm ?? callRcaLlm;
  const diagnostics: TrendDiagnostic[] = [];

  // Clamp floors here in the service layer (config.ts does not clamp).
  const maxIncidents = Math.max(cfg.maxIncidents, 1);
  const minClusterSize = Math.max(cfg.minClusterSize, 1);

  const windowEnd = new Date();
  const windowStart = new Date(
    windowEnd.getTime() -
      Math.max(args.windowDays ?? cfg.windowDays, 1) * 24 * 60 * 60 * 1000,
  );

  let incidents = await prisma.incident.findMany({
    where: {
      orgId: args.orgId,
      mergedIntoId: null,
      openedAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { openedAt: "asc" },
    include: {
      usecase: { select: { id: true, name: true } },
      rcaDrafts: {
        where: { status: "ok" },
        orderBy: { requestedAt: "desc" },
        take: 1,
        select: { summary: true },
      },
    },
  });

  if (incidents.length > maxIncidents) {
    incidents = incidents.slice(-maxIncidents);
    diagnostics.push({
      code: "corpus_capped",
      message: `Analyzed the ${maxIncidents} most recent in-window incidents`,
    });
  }

  if (incidents.length < cfg.insufficientDataFloor) {
    diagnostics.push({
      code: "insufficient_data",
      message: `Only ${incidents.length} incidents in window (floor ${cfg.insufficientDataFloor})`,
    });
  }

  // Resolve embeddings (best-effort backfill).
  const withEmbedding: { id: string; embedding: number[] }[] = [];
  let unembeddable = 0;
  for (const inc of incidents) {
    let emb = (inc.embedding as number[] | null) ?? null;
    if (!emb) {
      emb = await embedText(args.orgId, `${inc.title}\n${inc.rootCause}`);
    }
    if (emb) withEmbedding.push({ id: inc.id, embedding: emb });
    else unembeddable++;
  }
  if (unembeddable > 0) {
    diagnostics.push({
      code: "unembeddable_incidents",
      message: `${unembeddable} incidents could not be embedded`,
    });
  }

  // Cluster (embedding path, or category fallback when nothing embeds).
  let rawClusters: RawCluster[];
  if (withEmbedding.length === 0 && incidents.length > 0) {
    diagnostics.push({
      code: "embedding_fallback",
      message: "No embeddings available; grouped by category + severity",
    });
    rawClusters = groupByCategorySeverity(
      incidents.map((i) => ({
        id: i.id,
        category: i.category,
        severity: i.severity,
      })),
      { minClusterSize },
    );
  } else {
    rawClusters = clusterByEmbedding(withEmbedding, {
      threshold: cfg.clusterThreshold,
      minClusterSize,
    });
  }

  const byId = new Map(incidents.map((i) => [i.id, i]));
  const narrated = rawClusters.filter((c) => !c.isLongTail);
  const longTail = rawClusters.find((c) => c.isLongTail);
  const clusteredCount = narrated.reduce((n, c) => n + c.memberIds.length, 0);
  const longTailCount = longTail?.memberIds.length ?? 0;

  // Stats + deltas vs prior published.
  const statsInput: StatsInput[] = incidents.map((i) => ({
    category: i.category,
    severity: i.severity,
    status: i.status,
    usecaseId: i.usecase?.id ?? null,
    usecaseName: i.usecase?.name ?? null,
    frameworkRefs: (i.frameworkRefs as Record<string, string[]>) ?? {},
  }));
  const stats = computeStats(statsInput, { clusteredCount, longTailCount });
  const priorPublished = await prisma.incidentTrendReport.findFirst({
    where: { orgId: args.orgId, status: "published" },
    orderBy: { version: "desc" },
  });
  const priorStats = priorPublished
    ? (priorPublished.statsJson as unknown as ReturnType<typeof computeStats>)
    : null;
  const deltas = computeDeltas(stats, priorStats);

  // LLM narratives per narrated cluster (+ exec summary).
  let totalIn = 0;
  let totalOut = 0;
  let totalLat = 0;
  let providerType = "unknown";
  let model = "unknown";
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
    systemicRecommendation: string;
    confidence: string;
    dominantCategory: IncidentCategory | null;
    dominantSeverity: IncidentSeverity;
  };

  const built: Built[] = [];
  for (const c of narrated) {
    const members = c.memberIds
      .map((id) => byId.get(id)!)
      .filter((m): m is NonNullable<typeof m> => m != null);
    const { dominantCategory, dominantSeverity } = domin(members);
    let label = "";
    let narrative = "";
    let systemicRecommendation = "";
    let confidence = "";
    if (enabled) {
      const promptIncidents: ClusterPromptIncident[] = members.map((m) => ({
        title: m.title,
        category: m.category,
        severity: m.severity,
        rootCause: m.rootCause,
        usecaseName: m.usecase?.name ?? null,
        rcaSummary: m.rcaDrafts[0]?.summary ?? null,
      }));
      try {
        const res = await callLlm(
          buildClusterSystemPrompt(),
          buildClusterUserMessage(promptIncidents),
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
        systemicRecommendation = parsed.systemicRecommendation;
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
      systemicRecommendation,
      confidence,
      dominantCategory,
      dominantSeverity,
    });
  }

  let execSummary = "";
  if (enabled && built.length > 0) {
    try {
      const { system, user } = buildExecSummaryPrompt(
        built.map((b) => ({
          label: b.label,
          memberCount: b.raw.memberIds.length,
        })),
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

  // Persist frozen snapshot.
  const maxVersion = await prisma.incidentTrendReport.findFirst({
    where: { orgId: args.orgId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const report = await prisma.incidentTrendReport.create({
    data: {
      orgId: args.orgId,
      version: (maxVersion?.version ?? 0) + 1,
      status: "draft",
      windowStart,
      windowEnd,
      statsJson: stats as unknown as Prisma.InputJsonValue,
      deltaJson: deltas as unknown as Prisma.InputJsonValue,
      execSummary,
      diagnostics: diagnostics as unknown as Prisma.InputJsonValue,
      providerType,
      model,
      inputTokens: totalIn,
      outputTokens: totalOut,
      latencyMs: totalLat,
      incidentCount: incidents.length,
      generatedById: args.userId,
      clusters: {
        create: [
          ...built.map((b) => ({
            orgId: args.orgId,
            label: b.label,
            narrative: b.narrative,
            systemicRecommendation: b.systemicRecommendation,
            confidence: b.confidence,
            memberIncidentIds: b.raw
              .memberIds as unknown as Prisma.InputJsonValue,
            memberCount: b.raw.memberIds.length,
            dominantCategory: b.dominantCategory,
            dominantSeverity: b.dominantSeverity,
            isLongTail: false,
          })),
          ...(longTail
            ? [
                {
                  orgId: args.orgId,
                  label: "",
                  narrative: "",
                  systemicRecommendation: "",
                  confidence: "",
                  memberIncidentIds:
                    longTail.memberIds as unknown as Prisma.InputJsonValue,
                  memberCount: longTail.memberIds.length,
                  dominantCategory: null,
                  dominantSeverity: "low" as IncidentSeverity,
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

function domin(
  members: { category: IncidentCategory | null; severity: IncidentSeverity }[],
): {
  dominantCategory: IncidentCategory | null;
  dominantSeverity: IncidentSeverity;
} {
  const catCount = new Map<IncidentCategory, number>();
  const sevRank: Record<IncidentSeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  let topSev: IncidentSeverity = "low";
  for (const m of members) {
    if (m.category)
      catCount.set(m.category, (catCount.get(m.category) ?? 0) + 1);
    if (sevRank[m.severity] > sevRank[topSev]) topSev = m.severity;
  }
  let dominantCategory: IncidentCategory | null = null;
  let best = -1;
  for (const [cat, n] of catCount) {
    if (n > best) {
      best = n;
      dominantCategory = cat;
    }
  }
  return { dominantCategory, dominantSeverity: topSev };
}

async function loadOwn(
  orgId: string,
  id: string,
): Promise<IncidentTrendReport> {
  const row = await prisma.incidentTrendReport.findFirst({
    where: { id, orgId },
  });
  if (!row)
    throw new IncidentTrendsStateError(`Trend report ${id} not found in org`);
  return row;
}

export async function publishReport(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<IncidentTrendReport> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new IncidentTrendsStateError(
      `Report ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  const published = await prisma.$transaction(async (tx) => {
    await tx.incidentTrendReport.updateMany({
      where: { orgId: args.orgId, status: "published" },
      data: { status: "superseded" },
    });
    // userId reserved for future publishedById; model has no such field yet
    return tx.incidentTrendReport.update({
      where: { id: args.id },
      data: { status: "published", publishedAt: new Date() },
    });
  });

  // Fire-and-forget trend-alert evaluation; never let it break publish.
  try {
    if (published.deltaJson != null) {
      const clusters = await prisma.incidentTrendCluster.findMany({
        where: { orgId: args.orgId, reportId: published.id },
        select: {
          label: true,
          memberCount: true,
          dominantSeverity: true,
          isLongTail: true,
        },
      });
      const signals = evaluateTrendAlerts({
        stats: published.statsJson as unknown as TrendStats,
        deltas: published.deltaJson as unknown as TrendDeltas,
        clusters: clusters.map((c) => ({
          label: c.label,
          memberCount: c.memberCount,
          dominantSeverity: c.dominantSeverity ?? "high",
          isLongTail: c.isLongTail,
        })),
        config: getTrendsConfig(),
      });
      if (signals.length > 0) {
        workflowEvents.emitIncidentTrendsAlert({
          orgId: args.orgId,
          reportId: published.id,
          version: published.version,
          publishedByUserId: args.userId,
          signalCount: signals.length,
        });
      }
    }
  } catch (err) {
    console.error("[incident-trends] alert evaluation failed:", err);
  }

  return published;
}

export async function listReports(
  orgId: string,
): Promise<IncidentTrendReport[]> {
  return prisma.incidentTrendReport.findMany({
    where: { orgId },
    orderBy: { version: "desc" },
  });
}

export async function getReport(
  orgId: string,
  id: string,
): Promise<{ report: IncidentTrendReport; clusters: IncidentTrendCluster[] }> {
  const report = await loadOwn(orgId, id);
  const clusters = await prisma.incidentTrendCluster.findMany({
    where: { orgId, reportId: id },
    orderBy: [{ isLongTail: "asc" }, { memberCount: "desc" }],
  });
  return { report, clusters };
}
