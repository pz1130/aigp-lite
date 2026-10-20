import { prisma } from "@/lib/db";
import type { ProviderConnection, ProviderType } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto/secrets";
import { getReliableAdapter } from "@/lib/runtime/providers/registry";
import { CATALOG } from "@/lib/runtime/catalog";
import type {
  AdapterStreamOpts,
  ResponseFormat,
} from "@/lib/runtime/providers/types";

/**
 * Shared LLM plumbing for the in-product AI features (incident RCA, risk
 * copilot, policy assistant, inventory analysis, ...). Each org's own active
 * ProviderConnection is preferred so calls are billed to — and governed by —
 * the org's credentials; operator env config is the fallback.
 */

export const ORG_LLM_PROVIDER_TYPES: ProviderType[] = [
  "anthropic",
  "openai",
  "google_gemini",
  "azure_openai",
  "anthropic_compatible",
  "openai_compatible",
];

const DEFAULT_MODELS: Partial<Record<ProviderType, string>> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  google_gemini: "gemini-2.5-flash",
};

export const DEFAULT_BASE_URLS: Partial<Record<ProviderType, string>> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  google_gemini: "https://generativelanguage.googleapis.com",
};

export type ResolvedLlm = {
  providerType: ProviderType;
  baseUrl: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  model: string;
  source: "org" | "env";
};

export type LlmCallResult = {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  providerType: string;
  model: string;
};

/** Env-configured provider kinds used by the per-feature config modules. */
export type EnvLlmConfig = {
  kind: "anthropic" | "openai" | "google";
  apiKey: string;
  model: string;
};

const ENV_PROVIDER_TYPES: Record<EnvLlmConfig["kind"], ProviderType> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google_gemini",
};

export class NoProviderError extends Error {
  constructor() {
    super(
      "No active LLM provider connection found. Please configure a provider in Settings → Integrations.",
    );
  }
}

export class NoModelError extends Error {
  constructor(providerType: string) {
    super(
      `no model resolvable for providerType=${providerType}; set config.defaultModel on the connection`,
    );
  }
}

/** Returns the model to use for a connection, or null when none is known. */
export function resolveConnectionModel(
  conn: ProviderConnection,
): string | null {
  const config = (conn.config as Record<string, unknown>) ?? {};
  const fromConfig =
    typeof config.defaultModel === "string" ? config.defaultModel.trim() : "";
  if (fromConfig) return fromConfig;

  // Azure routes by deployment; the adapter ignores the model name.
  if (conn.providerType === "azure_openai") {
    return typeof config.deployment === "string" && config.deployment
      ? config.deployment
      : null;
  }

  const hardcoded = DEFAULT_MODELS[conn.providerType];
  if (hardcoded) return hardcoded;

  // For *_compatible providers, infer from the catalog by matching baseUrl
  if (conn.baseUrl) {
    const catalogHit = CATALOG.find(
      (e) =>
        e.providerType === conn.providerType &&
        e.defaultBaseUrl === conn.baseUrl,
    );
    const sample = catalogHit?.sampleModels?.[0];
    if (sample && !sample.startsWith("(")) return sample;
  }
  return null;
}

async function findOrgConnections(
  orgId: string,
  providerTypes: ProviderType[],
): Promise<ProviderConnection[]> {
  return prisma.providerConnection.findMany({
    where: { orgId, isActive: true, providerType: { in: providerTypes } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Picks the org's oldest active connection with a resolvable model.
 * Throws NoProviderError / NoModelError when nothing usable exists.
 */
export async function resolveOrgLlm(
  orgId: string,
  providerTypes: ProviderType[] = ORG_LLM_PROVIDER_TYPES,
): Promise<ResolvedLlm> {
  const conns = await findOrgConnections(orgId, providerTypes);
  if (conns.length === 0) throw new NoProviderError();
  for (const conn of conns) {
    const model = resolveConnectionModel(conn);
    if (!model) continue;
    return {
      providerType: conn.providerType,
      baseUrl: conn.baseUrl ?? DEFAULT_BASE_URLS[conn.providerType] ?? "",
      credentials: decryptJson<Record<string, string>>(
        conn.credentialsEncrypted,
      ),
      config: (conn.config as Record<string, unknown>) ?? {},
      model,
      source: "org",
    };
  }
  throw new NoModelError(conns[0].providerType);
}

export async function hasOrgLlm(orgId: string): Promise<boolean> {
  const conns = await findOrgConnections(orgId, ORG_LLM_PROVIDER_TYPES);
  return conns.some((c) => resolveConnectionModel(c) !== null);
}

export function envLlm(cfg: EnvLlmConfig): ResolvedLlm {
  const providerType = ENV_PROVIDER_TYPES[cfg.kind];
  return {
    providerType,
    baseUrl: DEFAULT_BASE_URLS[providerType] ?? "",
    credentials: { apiKey: cfg.apiKey },
    config: {},
    model: cfg.model,
    source: "env",
  };
}

/**
 * Org connection first, then the feature's env config. `envFallback` should
 * throw (with a feature-specific message) when the env is not configured.
 */
export async function resolveLlm(
  orgId: string,
  envFallback: () => EnvLlmConfig,
): Promise<ResolvedLlm> {
  try {
    return await resolveOrgLlm(orgId);
  } catch (err) {
    if (err instanceof NoProviderError || err instanceof NoModelError) {
      return envLlm(envFallback());
    }
    throw err;
  }
}

export async function callLlm(
  target: ResolvedLlm,
  systemPrompt: string,
  userMessage: string,
  responseFormat?: ResponseFormat,
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<LlmCallResult> {
  const adapter = getReliableAdapter(target.providerType, {
    timeoutMs,
    maxRetries: 1,
  });

  const opts: AdapterStreamOpts = {
    baseUrl: target.baseUrl,
    credentials: target.credentials,
    config: target.config,
    model: target.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    responseFormat,
  };

  const start = Date.now();
  let rawText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const chunk of adapter.streamChat(opts)) {
    if (chunk.delta) rawText += chunk.delta;
    if (chunk.usage) {
      inputTokens = chunk.usage.input ?? inputTokens;
      outputTokens = chunk.usage.output ?? outputTokens;
    }
    if (chunk.done) break;
  }

  return {
    rawText,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - start,
    providerType: target.providerType,
    model: target.model,
  };
}
