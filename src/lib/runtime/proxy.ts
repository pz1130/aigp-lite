import { evaluate } from "@/lib/policy-engine/evaluate";
import type {
  PolicyDescriptor,
  EvalContext,
  Hit,
} from "@/lib/policy-engine/types";
import { getReliableAdapter } from "./providers/registry";
import type { ChatMessage } from "./providers/types";
import type { ProviderType } from "@/lib/prisma";

export interface ProxyInput {
  connection: {
    providerType: ProviderType;
    baseUrl: string;
    credentials: Record<string, string>;
    config: Record<string, unknown>;
  };
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stop?: string[];
  policies: PolicyDescriptor[];
  evalCtxBase: Omit<EvalContext, "scope" | "text">;
  signal?: AbortSignal;
}

export interface ProxyEvent {
  type: "chunk" | "blocked" | "warn" | "done";
  text?: string;
  hit?: Hit;
  usage?: { input: number; output: number };
}

export async function* runProxy(input: ProxyInput): AsyncIterable<ProxyEvent> {
  const inputText = input.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const inputHits = evaluate(input.policies, {
    ...input.evalCtxBase,
    scope: "input",
    text: inputText,
  });
  const inputBlock = inputHits.find((h) => h.mode === "block");
  if (inputBlock) {
    yield { type: "blocked", hit: inputBlock };
    return;
  }
  for (const h of inputHits.filter((h) => h.mode === "warn"))
    yield { type: "warn", hit: h };

  const adapter = getReliableAdapter(
    input.connection.providerType,
    input.connection.config as
      { timeoutMs?: number; maxRetries?: number } | undefined,
  );

  let totalUsage: { input: number; output: number } | undefined;
  let outputBuffer = "";
  for await (const ch of adapter.streamChat({
    baseUrl: input.connection.baseUrl,
    credentials: input.connection.credentials,
    config: input.connection.config,
    model: input.model,
    messages: input.messages,
    signal: input.signal,
  })) {
    if (ch.usage) totalUsage = ch.usage;
    if (ch.delta) {
      outputBuffer += ch.delta;
      const outHits = evaluate(input.policies, {
        ...input.evalCtxBase,
        scope: "output",
        text: outputBuffer,
      });
      const block = outHits.find((h) => h.mode === "block");
      if (block) {
        yield { type: "blocked", hit: block };
        return;
      }
      for (const h of outHits.filter((h) => h.mode === "warn"))
        yield { type: "warn", hit: h };
      yield { type: "chunk", text: ch.delta };
    }
    if (ch.done) break;
  }
  yield { type: "done", usage: totalUsage };
}
