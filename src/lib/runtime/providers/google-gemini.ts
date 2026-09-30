import { createParser, type EventSourceMessage } from "eventsource-parser";
import { safeFetch } from "@/lib/egress/guard";
import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
  PingResult,
  ChatMessage,
} from "./types";

function toGemini(messages: ChatMessage[]) {
  const systemMsg = messages.find((m) => m.role === "system");
  const others = messages.filter((m) => m.role !== "system");
  return {
    contents: others.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    systemInstruction: systemMsg
      ? { parts: [{ text: systemMsg.content }] }
      : undefined,
  };
}

export const googleGeminiAdapter: ProviderAdapter = {
  async *streamChat(opts: AdapterStreamOpts): AsyncIterable<StreamChunk> {
    const url = `${opts.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.credentials.apiKey)}`;
    const { contents, systemInstruction } = toGemini(opts.messages);
    const res = await safeFetch(url, {
      method: "POST",
      signal: opts.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${text.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let usage: { input: number; output: number } | undefined;
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
            for (const p of parts) {
              if (typeof p.text === "string" && p.text)
                yield { delta: p.text, done: false };
            }
          }
          if (obj.usageMetadata) {
            usage = {
              input: obj.usageMetadata.promptTokenCount ?? 0,
              output: obj.usageMetadata.candidatesTokenCount ?? 0,
            };
          }
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
