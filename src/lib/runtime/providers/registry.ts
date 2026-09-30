import type { ProviderType } from "@/lib/prisma";
import type { ProviderAdapter } from "./types";
import { createOpenAIAdapter } from "./openai";
import { createAnthropicAdapter } from "./anthropic";
import { azureOpenAIAdapter } from "./azure-openai";
import { googleGeminiAdapter } from "./google-gemini";
import { openaiCompatibleAdapter } from "./openai-compatible";
import { anthropicCompatibleAdapter } from "./anthropic-compatible";
import { withReliability } from "../reliability";

const openaiSingleton = createOpenAIAdapter();
const anthropicSingleton = createAnthropicAdapter();

const adapters: Record<ProviderType, ProviderAdapter> = {
  openai: openaiSingleton,
  anthropic: anthropicSingleton,
  azure_openai: azureOpenAIAdapter,
  google_gemini: googleGeminiAdapter,
  openai_compatible: openaiCompatibleAdapter,
  anthropic_compatible: anthropicCompatibleAdapter,
};

export function getAdapter(type: ProviderType): ProviderAdapter {
  const a = adapters[type];
  if (!a) throw new Error(`no adapter registered for providerType ${type}`);
  return a;
}

export interface ReliableConfig {
  timeoutMs?: number;
  maxRetries?: number;
}

export function getReliableAdapter(
  type: ProviderType,
  config?: ReliableConfig,
): ProviderAdapter {
  const rawAdapter = getAdapter(type);
  return withReliability(rawAdapter, {
    timeoutMs: config?.timeoutMs ?? 30_000,
    maxRetries: config?.maxRetries ?? 2,
  });
}
