import { createParser, type EventSourceMessage } from "eventsource-parser";
import { safeFetch } from "@/lib/egress/guard";
import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
  PingResult,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    async *streamChat(opts: AdapterStreamOpts): AsyncIterable<StreamChunk> {
      const systemMsg = opts.messages.find((m) => m.role === "system");
      const otherMsgs = opts.messages.filter((m) => m.role !== "system");
      const res = await safeFetch(`${opts.baseUrl}/v1/messages`, {
        method: "POST",
        signal: opts.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.credentials.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          messages: otherMsgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system: systemMsg?.content,
          stream: true,
          max_tokens: 4096,
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`anthropic ${res.status}: ${text.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let inputTokens = 0;
      let outputTokens = 0;
      const events: EventSourceMessage[] = [];
      const parser = createParser({ onEvent: (e) => events.push(e) });
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value));
        while (events.length) {
          const ev = events.shift()!;
          let obj: unknown;
          try {
            obj = JSON.parse(ev.data);
          } catch {
            continue;
          }
          const record = asRecord(obj);
          if (ev.event === "message_start") {
            const message = asRecord(record?.message);
            const usage = asRecord(message?.usage);
            inputTokens = asNonNegativeNumber(usage?.input_tokens) ?? 0;
          } else if (ev.event === "content_block_delta") {
            const delta = asRecord(record?.delta);
            const text = delta?.text;
            if (typeof text === "string") yield { delta: text, done: false };
          } else if (ev.event === "message_delta") {
            const usage = asRecord(record?.usage);
            outputTokens =
              asNonNegativeNumber(usage?.output_tokens) ?? outputTokens;
          } else if (ev.event === "message_stop") {
            yield {
              delta: "",
              done: true,
              usage: { input: inputTokens, output: outputTokens },
            };
            return;
          }
        }
      }
      yield {
        delta: "",
        done: true,
        usage: { input: inputTokens, output: outputTokens },
      };
    },

    async ping(opts: AdapterStreamOpts): Promise<PingResult> {
      const start = Date.now();
      try {
        // No public /models endpoint; do a 1-token messages call instead.
        const res = await safeFetch(`${opts.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": opts.credentials.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: opts.model || "claude-3-5-haiku-latest",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(8000),
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
        const res = await safeFetch(`${opts.baseUrl}/v1/models`, {
          method: "GET",
          headers: {
            "x-api-key": opts.credentials.apiKey,
            "anthropic-version": "2023-06-01",
          },
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
