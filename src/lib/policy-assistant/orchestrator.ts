import { prisma } from "@/lib/db";
import { evaluate } from "@/lib/policy-engine/evaluate";
import type { PolicyDescriptor } from "@/lib/policy-engine/types";
import {
  llmOutputSchema,
  type LlmOutput,
  type GenerationResult,
} from "./schema";
import { buildSystemPrompt, buildRetryPrompt } from "./prompt";
import { callAssistantLlm, type LlmCallResult } from "./llm-client";

export type GeneratePolicyArgs = {
  description: string;
  orgId: string;
  userId: string;
};

export type GeneratePolicyReturn = {
  generationId: string;
  status: "ok" | "needs_review" | "failed";
  retryCount: number;
  output: GenerationResult;
};

type Diagnostic = NonNullable<GenerationResult["diagnostics"]>[number];

type TryResult = {
  status: "ok" | "needs_review" | "failed";
  parsed?: LlmOutput;
  diagnostics?: Diagnostic[];
  errorMessage?: string;
  tokens: {
    input: number;
    output: number;
    latencyMs: number;
    providerType: string;
    model: string;
  };
};

const STATUS_RANK = { ok: 0, needs_review: 1, failed: 2 } as const;

export async function generatePolicy(
  args: GeneratePolicyArgs,
): Promise<GeneratePolicyReturn> {
  const systemPrompt1 = buildSystemPrompt();
  const r1 = await tryGenerate(systemPrompt1, args.description);

  let final = r1;
  let retryCount = 0;
  let totalInput = r1.tokens.input;
  let totalOutput = r1.tokens.output;

  if (r1.status === "needs_review" && r1.parsed && r1.diagnostics) {
    const systemPrompt2 = buildRetryPrompt(
      systemPrompt1,
      args.description,
      r1.parsed,
      r1.diagnostics,
    );
    const r2 = await tryGenerate(systemPrompt2, args.description);
    retryCount = 1;
    totalInput += r2.tokens.input;
    totalOutput += r2.tokens.output;
    if (STATUS_RANK[r2.status] <= STATUS_RANK[r1.status]) {
      final = r2;
    }
  }

  const outputForDb: GenerationResult = final.parsed
    ? {
        ...final.parsed,
        status: final.status,
        diagnostics: final.diagnostics,
      }
    : {
        name: "",
        description: "",
        ruleJson: null,
        severity: "medium",
        enforcementMode: "log",
        scope: "input",
        tests: [
          { text: "", shouldHit: false, reason: "" },
          { text: "", shouldHit: false, reason: "" },
          { text: "", shouldHit: false, reason: "" },
        ],
        status: "failed",
        diagnostics: final.diagnostics,
      };

  const row = await prisma.policyAssistantGeneration.create({
    data: {
      orgId: args.orgId,
      userId: args.userId,
      description: args.description,
      status: final.status,
      outputJson: outputForDb as unknown as object,
      providerType: final.tokens.providerType,
      model: final.tokens.model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      latencyMs: final.tokens.latencyMs,
      retryCount,
      errorMessage: final.errorMessage ?? null,
    },
  });

  return {
    generationId: row.id,
    status: final.status,
    retryCount,
    output: outputForDb,
  };
}

async function tryGenerate(
  systemPrompt: string,
  userMessage: string,
): Promise<TryResult> {
  let llm: LlmCallResult;
  try {
    llm = await callAssistantLlm(systemPrompt, userMessage);
  } catch (err) {
    return {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      tokens: {
        input: 0,
        output: 0,
        latencyMs: 0,
        providerType: "unknown",
        model: "unknown",
      },
    };
  }

  const tokens = {
    input: llm.inputTokens,
    output: llm.outputTokens,
    latencyMs: llm.latencyMs,
    providerType: llm.providerType,
    model: llm.model,
  };

  const json = extractJson(llm.rawText);
  if (json === null) {
    return {
      status: "failed",
      errorMessage: "LLM did not return valid JSON",
      diagnostics: [{ kind: "schema_parse", message: "no JSON in output" }],
      tokens,
    };
  }

  const parseRes = llmOutputSchema.safeParse(json);
  if (!parseRes.success) {
    return {
      status: "failed",
      errorMessage: parseRes.error.message.slice(0, 500),
      diagnostics: [
        { kind: "schema_parse", message: parseRes.error.message.slice(0, 500) },
      ],
      tokens,
    };
  }

  const parsed = parseRes.data;
  const descriptor: PolicyDescriptor = {
    id: "preview",
    name: parsed.name,
    ruleJson: parsed.ruleJson,
    enforcementMode: parsed.enforcementMode,
    scope: "both",
    severity: parsed.severity,
  };

  try {
    evaluate([descriptor], { scope: "input", text: "smoke-test" });
  } catch (err) {
    return {
      status: "failed",
      parsed,
      diagnostics: [
        {
          kind: "evaluate_throw",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      tokens,
    };
  }

  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < parsed.tests.length; i++) {
    const t = parsed.tests[i];
    const evalScope = parsed.scope === "both" ? "input" : parsed.scope;
    const hits = evaluate([descriptor], { scope: evalScope, text: t.text });
    const didHit = hits.length > 0;
    if (didHit !== t.shouldHit) {
      diagnostics.push({
        kind: "self_check_miss",
        testIndex: i,
        message: `test "${t.reason}" expected shouldHit=${t.shouldHit} but got ${didHit}`,
      });
    }
  }

  if (diagnostics.length > 0) {
    return { status: "needs_review", parsed, diagnostics, tokens };
  }
  return { status: "ok", parsed, tokens };
}

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidate = fenced ? fenced[1] : text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
