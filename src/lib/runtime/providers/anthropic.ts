import { createParser, type EventSourceMessage } from "eventsource-parser";
import { safeFetch } from "@/lib/egress/guard";
import {
  contentText,
  type ProviderAdapter,
  type AdapterStreamOpts,
  type ChatMessage,
  type StreamChunk,
  type PingResult,
  type TokenUsage,
  type ToolCall,
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

function anthropicContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : {
          type: "image",
          source:
            p.data !== undefined
              ? { type: "base64", media_type: p.mediaType, data: p.data }
              : { type: "url", url: p.url },
        },
  );
}

export interface AnthropicAdapterOptions {
  /** Send `output_config.format` when the caller asks for it. */
  structuredOutputs?: boolean;
}

export function createAnthropicAdapter({
  structuredOutputs = true,
}: AnthropicAdapterOptions = {}): ProviderAdapter {
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
            content: anthropicContent(m.content),
          })),
          system: systemMsg ? contentText(systemMsg.content) : undefined,
          stream: true,
          max_tokens: 4096,
          ...(opts.tools?.length
            ? {
                tools: opts.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.inputSchema,
                })),
              }
            : {}),
          ...(structuredOutputs && opts.responseFormat
            ? {
                output_config: {
                  format: {
                    type: "json_schema",
                    schema: opts.responseFormat.schema,
                  },
                },
              }
            : {}),
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
      let cacheRead: number | undefined;
      let cacheWrite: number | undefined;
      const readCache = (usage: Record<string, unknown> | null) => {
        cacheRead =
          asNonNegativeNumber(usage?.cache_read_input_tokens) ?? cacheRead;
        cacheWrite =
          asNonNegativeNumber(usage?.cache_creation_input_tokens) ?? cacheWrite;
      };
      const usage = (): TokenUsage => ({
        input: inputTokens,
        output: outputTokens,
        ...(cacheRead !== undefined ? { cacheRead } : {}),
        ...(cacheWrite !== undefined ? { cacheWrite } : {}),
      });
      // Tool-use blocks in progress, keyed by content block index.
      const toolBlocks = new Map<number, ToolCall>();
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
            readCache(usage);
          } else if (ev.event === "content_block_start") {
            const block = asRecord(record?.content_block);
            const index = record?.index;
            if (block?.type === "tool_use" && typeof index === "number") {
              toolBlocks.set(index, {
                id: String(block.id ?? ""),
                name: String(block.name ?? ""),
                arguments: "",
              });
            }
          } else if (ev.event === "content_block_delta") {
            const delta = asRecord(record?.delta);
            const call =
              typeof record?.index === "number"
                ? toolBlocks.get(record.index)
                : undefined;
            if (call && typeof delta?.partial_json === "string") {
              call.arguments += delta.partial_json;
            } else if (typeof delta?.text === "string") {
              yield { delta: delta.text, done: false };
            }
          } else if (ev.event === "content_block_stop") {
            const index = record?.index;
            const call =
              typeof index === "number" ? toolBlocks.get(index) : undefined;
            if (call) {
              toolBlocks.delete(index as number);
              // A tool with no parameters streams no input deltas.
              if (!call.arguments) call.arguments = "{}";
              yield { delta: "", done: false, toolCalls: [call] };
            }
          } else if (ev.event === "message_delta") {
            const usage = asRecord(record?.usage);
            outputTokens =
              asNonNegativeNumber(usage?.output_tokens) ?? outputTokens;
            readCache(usage);
          } else if (ev.event === "message_stop") {
            yield { delta: "", done: true, usage: usage() };
            return;
          }
        }
      }
      yield { delta: "", done: true, usage: usage() };
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
