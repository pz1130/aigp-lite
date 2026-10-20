import { safeFetch } from "@/lib/egress/guard";
import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
  PingResult,
  ResponseFormat,
} from "./types";
import { openAIChatFields, parseOpenAIStream } from "./openai-chat";

export interface OpenAIAdapterOptions {
  /** Send `response_format: json_schema` when the caller asks for it. */
  structuredOutputs?: boolean;
}

export function createOpenAIAdapter({
  structuredOutputs = true,
}: OpenAIAdapterOptions = {}): ProviderAdapter {
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
          ...openAIChatFields(opts),
          stream: true,
          stream_options: { include_usage: true },
          ...(structuredOutputs && opts.responseFormat
            ? { response_format: openAIResponseFormat(opts.responseFormat) }
            : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`openai ${res.status}: ${text.slice(0, 200)}`);
      }
      yield* parseOpenAIStream(res.body);
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

/** OpenAI `response_format`, shared with the Azure adapter. Non-strict so
 * optional fields are allowed; callers validate the reply anyway. */
export function openAIResponseFormat(rf: ResponseFormat) {
  return {
    type: "json_schema",
    json_schema: { name: rf.name, schema: rf.schema, strict: false },
  };
}
