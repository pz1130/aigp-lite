import type { ProviderType } from "@/lib/prisma";
import { getAdapter } from "@/lib/runtime/providers/registry";
import type { AdapterStreamOpts } from "@/lib/runtime/providers/types";
import { getAssistantProvider, type AssistantProviderConfig } from "./config";

export type LlmCallResult = {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  providerType: string;
  model: string;
};

const BASE_URLS: Record<AssistantProviderConfig["kind"], string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  google: "https://generativelanguage.googleapis.com",
};

const PROVIDER_TYPE_MAP: Record<AssistantProviderConfig["kind"], ProviderType> =
  {
    anthropic: "anthropic",
    openai: "openai",
    google: "google_gemini",
  };

export async function callAssistantLlm(
  systemPrompt: string,
  userMessage: string,
): Promise<LlmCallResult> {
  const cfg = getAssistantProvider();
  const providerType = PROVIDER_TYPE_MAP[cfg.kind];
  const adapter = getAdapter(providerType);

  const opts: AdapterStreamOpts = {
    baseUrl: BASE_URLS[cfg.kind],
    credentials: { apiKey: cfg.apiKey },
    config: {},
    model: cfg.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
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
  return {
    rawText,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - start,
    providerType,
    model: cfg.model,
  };
}
