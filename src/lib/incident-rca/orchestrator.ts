import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import {
  llmOutputSchema,
  type Diagnostic,
  type LlmOutput,
  type TimelineEntry,
  type Recommendation,
} from "./schema";
import {
  buildSystemPrompt,
  buildRetryPrompt,
  type PromptInput,
} from "./prompt";
import { callRcaLlm } from "./llm-client";
import { validateOutput } from "./validate";
import { isRcaEnabled } from "./config";

export type GenerateRcaArgs = {
  orgId: string;
  userId: string;
  incidentId: string;
};

export type GenerateRcaResult = {
  draftId: string | null;
  status: "ok" | "needs_review" | "failed";
  retryCount: number;
  errorMessage?: string;
  summary: string;
  rootCause: string;
  timeline: TimelineEntry[];
  recommendations: Recommendation[];
  diagnostics: Diagnostic[];
  providerType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

const STATUS_RANK = { ok: 0, needs_review: 1, failed: 2 } as const;
const inFlight = new Set<string>();

export async function generateRca(
  args: GenerateRcaArgs,
): Promise<GenerateRcaResult> {
  const lockKey = `${args.orgId}:${args.incidentId}`;
  if (inFlight.has(lockKey)) {
    return failedResult({
      errorMessage: "already_running",
      diag: "already_running",
    });
  }
  inFlight.add(lockKey);
  try {
    return await runInner(args);
  } finally {
    inFlight.delete(lockKey);
  }
}

async function runInner(args: GenerateRcaArgs): Promise<GenerateRcaResult> {
  if (!isRcaEnabled()) {
    return failedResult({ errorMessage: "rca_disabled" });
  }

  const incident = await prisma.incident.findFirst({
    where: { id: args.incidentId, orgId: args.orgId },
    include: {
      usecase: true,
      policyEvaluation: true,
      llmInvocation: true,
    },
  });
  if (!incident) {
    return failedResult({
      errorMessage: "incident_not_found",
      diag: "incident_not_found",
    });
  }

  const auditTailRaw = await prisma.auditLog.findMany({
    where: {
      orgId: args.orgId,
      resourceType: "Incident",
      resourceId: args.incidentId,
    },
    orderBy: { seqNum: "asc" },
    take: 50,
  });
  const auditTail = auditTailRaw.map((r) => ({
    ts: r.ts.toISOString(),
    action: r.action,
    actorEmail: null as string | null,
    details: r.afterJson ?? r.beforeJson,
  }));

  const siblings = incident.relatedUsecaseId
    ? await prisma.incident.findMany({
        where: {
          orgId: args.orgId,
          relatedUsecaseId: incident.relatedUsecaseId,
          NOT: { id: incident.id },
        },
        orderBy: { openedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          severity: true,
          category: true,
          openedAt: true,
        },
      })
    : [];

  const preDiagnostics: Diagnostic[] = [];

  const promptInput: PromptInput = {
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      category: incident.category,
      frameworkRefs: (incident.frameworkRefs as Record<string, string[]>) ?? {},
      openedAt: incident.openedAt.toISOString(),
      closedAt: incident.closedAt?.toISOString() ?? null,
      rootCause: incident.rootCause ?? "",
    },
    usecase: incident.usecase
      ? {
          name: incident.usecase.name,
          autonomyLevel: incident.usecase.autonomyLevel,
          deploymentType: incident.usecase.deploymentType,
          description: incident.usecase.description ?? "",
        }
      : null,
    policyEvaluation: incident.policyEvaluation
      ? {
          hit: incident.policyEvaluation.hit,
          snippet: incident.policyEvaluation.snippet,
        }
      : null,
    llmInvocation: incident.llmInvocation
      ? {
          provider: incident.llmInvocation.provider,
          model: incident.llmInvocation.model,
          blocked: incident.llmInvocation.blocked,
          promptHash: incident.llmInvocation.promptHash,
        }
      : null,
    auditTail,
    siblingIncidents: siblings.map((s) => ({
      id: s.id,
      title: s.title,
      severity: s.severity,
      category: s.category,
      openedAt: s.openedAt.toISOString(),
    })),
  };

  const systemPrompt = buildSystemPrompt(promptInput);

  const a1 = await runAttempt(
    systemPrompt,
    promptInput,
    incident.openedAt,
    preDiagnostics,
  );
  let final = a1;
  let retryCount = 0;
  let totalIn = a1.tokens.inputTokens;
  let totalOut = a1.tokens.outputTokens;
  let totalLat = a1.tokens.latencyMs;

  if (a1.status === "needs_review") {
    const retrySys = buildRetryPrompt(
      systemPrompt,
      promptInput,
      a1.parsed!,
      a1.diagnostics,
    );
    const a2 = await runAttempt(
      retrySys,
      promptInput,
      incident.openedAt,
      preDiagnostics,
    );
    retryCount = 1;
    totalIn += a2.tokens.inputTokens;
    totalOut += a2.tokens.outputTokens;
    totalLat += a2.tokens.latencyMs;
    if (STATUS_RANK[a2.status] <= STATUS_RANK[a1.status]) final = a2;
  }

  const persisted = await prisma.incidentRcaDraft.create({
    data: {
      orgId: args.orgId,
      incidentId: args.incidentId,
      status: final.status,
      retryCount,
      inputTokens: totalIn,
      outputTokens: totalOut,
      latencyMs: totalLat,
      providerType: final.tokens.providerType,
      model: final.tokens.model,
      summary: final.result?.summary ?? "",
      rootCause: final.result?.rootCause ?? "",
      timeline: (final.result?.timeline ??
        []) as unknown as Prisma.InputJsonValue,
      recommendations: (final.result?.recommendations ??
        []) as unknown as Prisma.InputJsonValue,
      rawOutput: (final.rawJson ?? {}) as Prisma.InputJsonValue,
      diagnostics: final.diagnostics as unknown as Prisma.InputJsonValue,
      errorMessage: final.errorMessage,
      requestedById: args.userId,
    },
  });

  return {
    draftId: persisted.id,
    status: final.status,
    retryCount,
    errorMessage: final.errorMessage,
    summary: persisted.summary,
    rootCause: persisted.rootCause,
    timeline: final.result?.timeline ?? [],
    recommendations: final.result?.recommendations ?? [],
    diagnostics: final.diagnostics,
    providerType: final.tokens.providerType,
    model: final.tokens.model,
    inputTokens: totalIn,
    outputTokens: totalOut,
    latencyMs: totalLat,
  };
}

type Attempt = {
  status: "ok" | "needs_review" | "failed";
  parsed?: LlmOutput;
  result?: {
    summary: string;
    rootCause: string;
    timeline: TimelineEntry[];
    recommendations: Recommendation[];
  };
  diagnostics: Diagnostic[];
  rawJson?: unknown;
  errorMessage?: string;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    providerType: string;
    model: string;
  };
};

async function runAttempt(
  systemPrompt: string,
  promptInput: PromptInput,
  openedAt: Date,
  preDiagnostics: Diagnostic[],
): Promise<Attempt> {
  let llm;
  try {
    llm = await callRcaLlm(systemPrompt, "Analyse the incident above.");
  } catch (err) {
    return {
      status: "failed",
      diagnostics: [
        {
          code: "provider_error",
          message: String((err as Error).message ?? err).slice(0, 280),
        },
      ],
      errorMessage: "provider_error",
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        providerType: "unknown",
        model: "unknown",
      },
    };
  }

  let parsed: LlmOutput;
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(stripCodeFence(llm.rawText));
    parsed = llmOutputSchema.parse(rawJson);
  } catch (err) {
    return {
      status: "failed",
      rawJson,
      diagnostics: [
        {
          code: "schema_parse_failed",
          message: String((err as Error).message ?? err).slice(0, 280),
        },
      ],
      errorMessage: "schema_parse_failed",
      tokens: llm,
    };
  }

  const v = validateOutput({
    raw: parsed,
    openedAt,
    now: new Date(),
    preDiagnostics,
  });

  return {
    status: v.status,
    parsed,
    result: {
      summary: v.summary,
      rootCause: v.rootCause,
      timeline: v.timeline,
      recommendations: v.recommendations,
    },
    diagnostics: v.diagnostics,
    rawJson,
    errorMessage: v.status === "failed" ? "empty_output" : undefined,
    tokens: llm,
  };
}

function stripCodeFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function failedResult(opts: {
  errorMessage: string;
  diag?: import("./schema").DiagnosticCode;
}): GenerateRcaResult {
  return {
    draftId: null,
    status: "failed",
    retryCount: 0,
    errorMessage: opts.errorMessage,
    summary: "",
    rootCause: "",
    timeline: [],
    recommendations: [],
    diagnostics: opts.diag
      ? [{ code: opts.diag, message: opts.errorMessage }]
      : [],
    providerType: "unknown",
    model: "unknown",
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  };
}
