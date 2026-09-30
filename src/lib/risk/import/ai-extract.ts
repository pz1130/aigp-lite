import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";
import { getReliableAdapter } from "@/lib/runtime/providers/registry";
import { CATALOG } from "@/lib/runtime/catalog";
import {
  EXTRACT_SYSTEM,
  buildExtractPrompt,
  parseExtraction,
  type RawControl,
} from "./prompt";
import type { ProviderConnection } from "@/lib/prisma";

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
};

export class NoProviderError extends Error {
  constructor() {
    super("no active LLM provider connection configured");
  }
}

function resolveModel(conn: ProviderConnection): string {
  const config = (conn.config as Record<string, unknown>) ?? {};
  const fromConfig =
    typeof config.defaultModel === "string" ? config.defaultModel.trim() : "";
  if (fromConfig) return fromConfig;
  const hardcoded = DEFAULT_MODELS[conn.providerType];
  if (hardcoded) return hardcoded;
  if (conn.baseUrl) {
    const hit = CATALOG.find(
      (e) =>
        e.providerType === conn.providerType &&
        e.defaultBaseUrl === conn.baseUrl,
    );
    const sample = hit?.sampleModels?.[0];
    if (sample && !sample.startsWith("(")) return sample;
  }
  throw new Error(`no model resolvable for providerType=${conn.providerType}`);
}

export async function extractControlsFromText(
  orgId: string,
  text: string,
  frameworkName: string,
): Promise<RawControl[]> {
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
    timeoutMs: 120_000,
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
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: buildExtractPrompt(text, frameworkName) },
    ],
  })) {
    if (ch.delta) buffer += ch.delta;
    if (ch.done) break;
  }

  return parseExtraction(buffer);
}
