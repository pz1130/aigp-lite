import { createParser, type EventSourceMessage } from "eventsource-parser";
import { safeFetch } from "@/lib/egress/guard";
import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
  PingResult,
} from "./types";

export function createOpenAIAdapter(): ProviderAdapter {
  return {
    async *streamChat(opts: AdapterStreamOpts): AsyncIterable<StreamChunk> {
      const res = await safeFetch(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        signal: opts.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.credentials.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`openai ${res.status}: ${text.slice(0, 200)}`);
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
          if (ev.data === "[DONE]") {
            yield { delta: "", done: true, usage };
            return;
          }
          try {
            const obj = JSON.parse(ev.data);
            if (obj.usage)
              usage = {
                input: obj.usage.prompt_tokens,
                output: obj.usage.completion_tokens,
              };
            const delta = obj.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta)
              yield { delta, done: false };
          } catch {
            /* keepalive */
          }
        }
      }
      yield { delta: "", done: true, usage };
    },

    async ping(opts: AdapterStreamOpts): Promise<PingResult> {
      const start = Date.now();
      try {
        const res = await safeFetch(`${opts.baseUrl}/models`, {
          method: "GET",
          headers: { authorization: `Bearer ${opts.credentials.apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
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
        const res = await safeFetch(`${opts.baseUrl}/models`, {
          method: "GET",
          headers: { authorization: `Bearer ${opts.credentials.apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const body = (await res.json().catch(() => null)) as {
          data?: Array<{ id?: string }>;
        } | null;
        const ids = Array.isArray(body?.data)
          ? body!.data
              .map((m) => m?.id)
              .filter((x): x is string => typeof x === "string" && x.length > 0)
          : [];
        return { ok: true, models: ids.sort() };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
  };
}
