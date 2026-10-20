export interface TextPart {
  type: "text";
  text: string;
}

/** An image given either inline (base64 `data`) or by `url`. */
export interface ImagePart {
  type: "image";
  /** e.g. "image/png"; required with `data`. */
  mediaType?: string;
  data?: string;
  url?: string;
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/** The text of a message, ignoring non-text parts. */
export function contentText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** A function the model may call; `inputSchema` is a JSON schema object. */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** A completed tool call; `arguments` is the raw JSON string. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Token counts as the provider reports them. `input` keeps each provider's
 * own meaning (Anthropic excludes cached tokens, OpenAI and Gemini include
 * them); the optional fields are only set when the provider reports them.
 */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
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
  tools?: ToolDefinition[];
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  usage?: TokenUsage;
  /** Set on the chunk where the provider finished emitting these calls. */
  toolCalls?: ToolCall[];
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
