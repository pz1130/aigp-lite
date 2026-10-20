import { createParser, type EventSourceMessage } from "eventsource-parser";
import { safeFetch } from "@/lib/egress/guard";
import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
  PingResult,
  ChatMessage,
  TokenUsage,
  ToolCall,
} from "./types";
import { contentText } from "./types";

function geminiParts(content: ChatMessage["content"]) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((p) =>
    p.type === "text"
      ? { text: p.text }
      : p.data !== undefined
        ? { inlineData: { mimeType: p.mediaType, data: p.data } }
        : { fileData: { fileUri: p.url, mimeType: p.mediaType } },
  );
}

function toGemini(messages: ChatMessage[]) {
  const systemMsg = messages.find((m) => m.role === "system");
  const others = messages.filter((m) => m.role !== "system");
  return {
    contents: others.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: geminiParts(m.content),
    })),
    systemInstruction: systemMsg
      ? { parts: [{ text: contentText(systemMsg.content) }] }
      : undefined,
  };
}

function readUsage(u: Record<string, unknown>): TokenUsage {
  const usage: TokenUsage = {
    input: (u.promptTokenCount as number) ?? 0,
    output: (u.candidatesTokenCount as number) ?? 0,
  };
  if (typeof u.cachedContentTokenCount === "number")
    usage.cacheRead = u.cachedContentTokenCount;
  if (typeof u.thoughtsTokenCount === "number")
    usage.reasoning = u.thoughtsTokenCount;
  return usage;
}

export const googleGeminiAdapter: ProviderAdapter = {
  async *streamChat(opts: AdapterStreamOpts): AsyncIterable<StreamChunk> {
    const url = `${opts.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.credentials.apiKey)}`;
    const { contents, systemInstruction } = toGemini(opts.messages);
    const res = await safeFetch(url, {
      method: "POST",
      signal: opts.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction,
        ...(opts.tools?.length
          ? {
              tools: [
                {
                  functionDeclarations: opts.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema,
                  })),
                },
              ],
            }
          : {}),
        ...(opts.responseFormat
          ? {
              generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: opts.responseFormat.schema,
              },
            }
          : {}),
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${text.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let usage: TokenUsage | undefined;
    // Gemini function calls carry no id; number them per response.
    let callSeq = 0;
    const events: EventSourceMessage[] = [];
    const parser = createParser({ onEvent: (e) => events.push(e) });
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value));
      while (events.length) {
        const ev = events.shift()!;
        try {
          const obj = JSON.parse(ev.data);
          const parts = obj.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            const toolCalls: ToolCall[] = [];
            for (const p of parts) {
              if (typeof p.text === "string" && p.text)
                yield { delta: p.text, done: false };
              if (typeof p.functionCall?.name === "string") {
                toolCalls.push({
                  id: p.functionCall.id ?? `call_${callSeq++}`,
                  name: p.functionCall.name,
                  arguments: JSON.stringify(p.functionCall.args ?? {}),
                });
              }
            }
            if (toolCalls.length) yield { delta: "", done: false, toolCalls };
          }
          if (obj.usageMetadata) usage = readUsage(obj.usageMetadata);
        } catch {
          /* skip */
        }
      }
    }
    yield { delta: "", done: true, usage };
  },

  async ping(opts: AdapterStreamOpts): Promise<PingResult> {
    const start = Date.now();
    try {
      const url = `${opts.baseUrl.replace(/\/$/, "")}/v1beta/models?key=${encodeURIComponent(opts.credentials.apiKey)}`;
      const res = await safeFetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok
        ? { ok: true, latencyMs: Date.now() - start }
        : {
            ok: false,
            latencyMs: Date.now() - start,
            error: `HTTP ${res.status}`,
          };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, error: String(e) };
    }
  },

  async listModels(opts) {
    try {
      const url = `${opts.baseUrl.replace(/\/$/, "")}/v1beta/models?key=${encodeURIComponent(opts.credentials.apiKey)}`;
      const res = await safeFetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json().catch(() => null)) as {
        models?: Array<{ name?: string }>;
      } | null;
      const ids = Array.isArray(body?.models)
        ? body!.models
            .map((m) => m?.name?.replace(/^models\//, ""))
            .filter((x): x is string => typeof x === "string" && x.length > 0)
        : [];
      return { ok: true, models: ids.sort() };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
};
