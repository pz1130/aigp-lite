import { safeFetch } from "@/lib/egress/guard";
import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
  PingResult,
} from "./types";
import { openAIResponseFormat } from "./openai";
import { openAIChatFields, parseOpenAIStream } from "./openai-chat";

function buildUrl(cfg: Record<string, unknown>): string {
  const endpoint = String(cfg.endpoint ?? "");
  const deployment = String(cfg.deployment ?? "");
  const apiVersion = String(cfg.apiVersion ?? "");
  if (!endpoint || !deployment || !apiVersion) {
    throw new Error(
      "azure: endpoint, deployment, and apiVersion are all required",
    );
  }
  return `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
}

export const azureOpenAIAdapter: ProviderAdapter = {
  async *streamChat(opts: AdapterStreamOpts): AsyncIterable<StreamChunk> {
    const url = buildUrl(opts.config);
    const res = await safeFetch(url, {
      method: "POST",
      signal: opts.signal,
      headers: {
        "content-type": "application/json",
        "api-key": opts.credentials.apiKey,
      },
      body: JSON.stringify({
        ...openAIChatFields(opts),
        stream: true,
        stream_options: { include_usage: true },
        ...(opts.responseFormat
          ? { response_format: openAIResponseFormat(opts.responseFormat) }
          : {}),
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`azure ${res.status}: ${text.slice(0, 200)}`);
    }
    yield* parseOpenAIStream(res.body);
  },

  async ping(opts: AdapterStreamOpts): Promise<PingResult> {
    const start = Date.now();
    try {
      const endpoint = String(opts.config.endpoint ?? "").replace(/\/$/, "");
      if (!endpoint)
        return { ok: false, latencyMs: 0, error: "endpoint missing" };
      const res = await safeFetch(
        `${endpoint}/openai/models?api-version=${opts.config.apiVersion}`,
        {
          headers: { "api-key": opts.credentials.apiKey },
          signal: AbortSignal.timeout(5000),
        },
      );
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
      const endpoint = String(opts.config.endpoint ?? "").replace(/\/$/, "");
      if (!endpoint) return { ok: false, error: "endpoint missing" };
      const res = await safeFetch(
        `${endpoint}/openai/models?api-version=${opts.config.apiVersion}`,
        {
          headers: { "api-key": opts.credentials.apiKey },
          signal: AbortSignal.timeout(10_000),
        },
      );
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
