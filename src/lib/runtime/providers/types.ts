export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Ask the provider to constrain its reply to a JSON schema (native
 * structured outputs). Adapters that cannot honour it ignore it, so callers
 * must still parse and validate the reply themselves.
 */
export interface ResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface AdapterStreamOpts {
  baseUrl: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  responseFormat?: ResponseFormat;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  usage?: { input: number; output: number };
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ListModelsResult {
  ok: boolean;
  models?: string[];
  error?: string;
}

export interface ProviderAdapter {
  streamChat(opts: AdapterStreamOpts): AsyncIterable<StreamChunk>;
  ping(opts: AdapterStreamOpts): Promise<PingResult>;
  listModels(opts: AdapterStreamOpts): Promise<ListModelsResult>;
}
