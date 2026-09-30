export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AdapterStreamOpts {
  baseUrl: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
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
