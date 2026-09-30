import { prisma } from "@/lib/db";
import type { ProviderConnection } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto/secrets";
import { getReliableAdapter } from "@/lib/runtime/providers/registry";
import { CATALOG } from "@/lib/runtime/catalog";
import { SYSTEM, buildUserPrompt, type UsecaseInput } from "./prompt";

const DEFAULT_MODELS: Partial<
  Record<ProviderConnection["providerType"], string>
> = {
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-4o-mini",
};

const DEFAULT_BASE_URLS: Partial<
  Record<ProviderConnection["providerType"], string>
> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  google_gemini: "https://generativelanguage.googleapis.com",
};

export interface LlmResult {
  raw: string;
  modelProvider: string;
  modelName: string;
}

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

function resolveModel(conn: ProviderConnection): string {
  const config = (conn.config as Record<string, unknown>) ?? {};
  const fromConfig =
    typeof config.defaultModel === "string" ? config.defaultModel.trim() : "";
  if (fromConfig) return fromConfig;

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

  throw new NoModelError(conn.providerType);
}

export async function callAnalysisLlm(
  orgId: string,
  usecase: UsecaseInput,
): Promise<LlmResult> {
  const conn = await prisma.providerConnection.findFirst({
    where: {
      orgId,
      isActive: true,
      providerType: {
        in: [
          "anthropic",
          "openai",
          "anthropic_compatible",
          "openai_compatible",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!conn) throw new NoProviderError();

  const credentials = decryptJson<Record<string, string>>(
    conn.credentialsEncrypted,
  );
  const config = (conn.config as Record<string, unknown>) ?? {};
  const adapter = getReliableAdapter(conn.providerType, {
    timeoutMs: 60_000,
    maxRetries: 1,
  });
  const model = resolveModel(conn);
  const baseUrl = conn.baseUrl ?? DEFAULT_BASE_URLS[conn.providerType] ?? "";

  let buffer = "";
  for await (const ch of adapter.streamChat({
    baseUrl,
    credentials,
    config,
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildUserPrompt(usecase) },
    ],
  })) {
    if (ch.delta) buffer += ch.delta;
    if (ch.done) break;
  }

  return { raw: buffer, modelProvider: conn.providerType, modelName: model };
}
