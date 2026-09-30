import { getJudgeProvider } from "@/lib/drift/config";
import { getAdapter } from "@/lib/runtime/providers/registry";
import type { ProviderType } from "@/lib/prisma";
import type { AdapterStreamOpts } from "@/lib/runtime/providers/types";

export const PROVIDER_TYPE_MAP: Record<string, ProviderType> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google_gemini",
};

export const BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  google: "https://generativelanguage.googleapis.com",
};

export type TargetCallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export async function callTargetModel(
  provider: string,
  model: string,
  promptText: string,
): Promise<TargetCallResult> {
  const providerType = PROVIDER_TYPE_MAP[provider];
  if (!providerType) throw new Error(`Unknown provider: ${provider}`);
  const adapter = getAdapter(providerType);
  const cfg = getJudgeProvider();

  const opts: AdapterStreamOpts = {
    baseUrl: BASE_URLS[provider],
    credentials: { apiKey: cfg.apiKey },
    config: {},
    model,
    messages: [{ role: "user", content: promptText }],
  };

  const start = Date.now();
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const chunk of adapter.streamChat(opts)) {
    if (chunk.delta) text += chunk.delta;
    if (chunk.usage) {
      inputTokens = chunk.usage.input;
      outputTokens = chunk.usage.output;
    }
  }
  return { text, inputTokens, outputTokens, latencyMs: Date.now() - start };
}
