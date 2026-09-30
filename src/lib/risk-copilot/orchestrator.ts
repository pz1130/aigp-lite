import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import {
  llmOutputSchema,
  type Diagnostic,
  type SuggestionItem,
} from "./schema";
import {
  buildSystemPrompt,
  buildRetryPrompt,
  type CatalogEntry,
  type PromptInput,
} from "./prompt";
import { callCopilotLlm, type LlmCallResult } from "./llm-client";
import { validateSuggestions, type CatalogIndex } from "./validate";
import { isCopilotEnabled, getCatalogTokenBudget } from "./config";
import { selectCatalogWithinBudget } from "./catalog-budget";

export type SuggestRisksArgs = {
  orgId: string;
  userId: string;
  usecaseId: string;
};

export type SuggestRisksResult = {
  suggestionId: string | null;
  status: "ok" | "needs_review" | "failed";
  retryCount: number;
  errorMessage?: string;
  items: SuggestionItem[];
  diagnostics: Diagnostic[];
  providerType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

const STATUS_RANK = { ok: 0, needs_review: 1, failed: 2 } as const;
const DESC_MIN = 20;

const inFlight = new Set<string>();

export async function suggestRisks(
  args: SuggestRisksArgs,
): Promise<SuggestRisksResult> {
  const lockKey = `${args.orgId}:${args.usecaseId}`;
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

async function runInner(args: SuggestRisksArgs): Promise<SuggestRisksResult> {
  if (!isCopilotEnabled()) {
    return failedResult({ errorMessage: "copilot_disabled" });
  }

  const usecase = await prisma.aiUsecase.findFirst({
    where: { id: args.usecaseId, orgId: args.orgId },
  });
  if (!usecase) return failedResult({ errorMessage: "usecase_not_found" });
  if ((usecase.description ?? "").trim().length < DESC_MIN) {
    return failedResult({
      errorMessage: "description_too_short",
      diag: "description_too_short",
    });
  }

  const rawCatalog = await prisma.riskCatalog.findMany({
    where: { OR: [{ orgId: null }, { orgId: args.orgId }] },
    include: { mitigations: { include: { control: true } } },
    orderBy: [{ source: "asc" }, { code: "asc" }],
  });
  if (rawCatalog.length === 0) {
    return failedResult({
      errorMessage: "catalog_empty",
      diag: "catalog_empty",
    });
  }

  const truncatedDiag: Diagnostic[] = [];
  const { kept: catalogForPrompt, dropped } = selectCatalogWithinBudget(
    rawCatalog,
    getCatalogTokenBudget(),
  );
  if (dropped.length > 0) {
    const detail = dropped.map((d) => `${d.count} ${d.source}`).join(", ");
    truncatedDiag.push({
      code: "catalog_truncated",
      message: `catalog truncated: dropped ${detail}`,
    });
  }

  const catalogEntries: CatalogEntry[] = catalogForPrompt.map((r) => ({
    code: r.code,
    title: r.title,
    category: r.category,
    summary: r.summary,
    mitigations: r.mitigations.map((m) => ({
      controlId: m.control.id,
      name: m.control.title,
    })),
  }));

  const catalogIndex: CatalogIndex = new Map(
    rawCatalog.map((r) => [
      r.code,
      { mitigationIds: new Set(r.mitigations.map((m) => m.control.id)) },
    ]),
  );
  const codeToId = new Map(rawCatalog.map((r) => [r.code, r.id]));

  const promptInput: PromptInput = {
    usecase: {
      name: usecase.name,
      description: usecase.description ?? "",
      autonomyLevel: usecase.autonomyLevel,
      deploymentType: usecase.deploymentType,
      modelCardMd: usecase.modelCardMd ?? "",
    },
    catalog: catalogEntries,
  };
  const sys = buildSystemPrompt(promptInput);

  const a1 = await runAttempt(
    sys,
    promptInput,
    catalogIndex,
    "Please analyse the usecase above.",
  );
  let final = a1;
  let retryCount = 0;
  let totalIn = a1.tokens.inputTokens;
  let totalOut = a1.tokens.outputTokens;
  let totalLat = a1.tokens.latencyMs;

  if (a1.status === "needs_review") {
    const retrySys = buildRetryPrompt(
      sys,
      promptInput,
      a1.parsed!,
      a1.diagnostics,
    );
    const a2 = await runAttempt(
      retrySys,
      promptInput,
      catalogIndex,
      "Retry. Fix the listed issues.",
    );
    retryCount = 1;
    totalIn += a2.tokens.inputTokens;
    totalOut += a2.tokens.outputTokens;
    totalLat += a2.tokens.latencyMs;
    if (STATUS_RANK[a2.status] <= STATUS_RANK[a1.status]) {
      final = a2;
    }
  }

  const allDiagnostics = [...truncatedDiag, ...final.diagnostics];
  const status = final.status;

  const persisted = await prisma.riskCopilotSuggestion.create({
    data: {
      orgId: args.orgId,
      usecaseId: args.usecaseId,
      requestedById: args.userId,
      status,
      retryCount,
      inputTokens: totalIn,
      outputTokens: totalOut,
      latencyMs: totalLat,
      providerType: final.tokens.providerType,
      model: final.tokens.model,
      rawOutput: final.rawJson ?? {},
      diagnostics: allDiagnostics as unknown as Prisma.InputJsonValue,
      errorMessage: final.errorMessage,
      items: final.items.length
        ? {
            create: final.items.map((it) => ({
              riskCatalogId: codeToId.get(it.riskCode)!,
              severity: it.severity,
              rationale: it.rationale,
              evidenceQuote: it.evidenceQuote,
              mitigationIds: it.mitigationIds,
            })),
          }
        : undefined,
    },
    include: { items: true },
  });

  return {
    suggestionId: persisted.id,
    status,
    retryCount,
    errorMessage: final.errorMessage ?? undefined,
    items: final.items,
    diagnostics: allDiagnostics,
    providerType: final.tokens.providerType,
    model: final.tokens.model,
    inputTokens: totalIn,
    outputTokens: totalOut,
    latencyMs: totalLat,
  };
}

type Attempt = {
  status: "ok" | "needs_review" | "failed";
  parsed?: import("./schema").LlmOutput;
  items: SuggestionItem[];
  diagnostics: Diagnostic[];
  errorMessage?: string;
  rawJson?: unknown;
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
  catalog: CatalogIndex,
  userMessage: string,
): Promise<Attempt> {
  let llm: LlmCallResult;
  try {
    llm = await callCopilotLlm(systemPrompt, userMessage);
  } catch (err) {
    return {
      status: "failed",
      items: [],
      diagnostics: [
        {
          code: "provider_error",
          message: String((err as Error).message ?? err),
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

  let parsed: import("./schema").LlmOutput;
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(stripCodeFence(llm.rawText));
    parsed = llmOutputSchema.parse(rawJson);
  } catch (err) {
    return {
      status: "failed",
      items: [],
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

  const { items, diagnostics } = validateSuggestions({
    raw: parsed,
    catalog,
    usecase: {
      description: promptInput.usecase.description,
      modelCardMd: promptInput.usecase.modelCardMd,
    },
  });

  const status: Attempt["status"] =
    items.length === 0
      ? parsed.flag === "insufficient_info"
        ? "failed"
        : "failed"
      : diagnostics.length > 0
        ? "needs_review"
        : "ok";

  return { status, parsed, items, diagnostics, rawJson, tokens: llm };
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
}): SuggestRisksResult {
  return {
    suggestionId: null,
    status: "failed",
    retryCount: 0,
    errorMessage: opts.errorMessage,
    items: [],
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
