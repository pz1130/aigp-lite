import { createParser, type EventSourceMessage } from "eventsource-parser";
import {
  contentText,
  type AdapterStreamOpts,
  type ChatMessage,
  type ContentPart,
  type ImagePart,
  type StreamChunk,
  type TextPart,
  type TokenUsage,
  type ToolCall,
  type ToolResultPart,
} from "./types";

/**
 * Chat Completions request/stream plumbing shared by the OpenAI and Azure
 * OpenAI adapters, which speak the same wire format.
 */

function toOpenAIContent(content: string | (TextPart | ImagePart)[]) {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : {
          type: "image_url",
          image_url: {
            url:
              p.data !== undefined
                ? `data:${p.mediaType};base64,${p.data}`
                : p.url,
          },
        },
  );
}

function isToolResult(p: ContentPart): p is ToolResultPart {
  return p.type === "tool_result";
}

/** One message, or several: each tool result is its own `tool` message. */
function toOpenAIMessages(m: ChatMessage): Record<string, unknown>[] {
  if (m.role === "assistant" && m.toolCalls?.length) {
    return [
      {
        role: m.role,
        content: contentText(m.content) || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        })),
      },
    ];
  }
  if (typeof m.content === "string")
    return [{ role: m.role, content: m.content }];
  const results = m.content.filter(isToolResult);
  const rest = m.content.filter(
    (p): p is TextPart | ImagePart => !isToolResult(p),
  );
  return [
    // Tool messages must directly follow the assistant's tool_calls.
    ...results.map((r) => ({
      role: "tool",
      tool_call_id: r.toolCallId,
      content: r.content,
    })),
    ...(rest.length > 0 || results.length === 0
      ? [{ role: m.role, content: toOpenAIContent(rest) }]
      : []),
  ];
}

/** Messages and tools in Chat Completions form. */
export function openAIChatFields(opts: AdapterStreamOpts) {
  return {
    messages: opts.messages.flatMap(toOpenAIMessages),
    ...(opts.tools?.length
      ? {
          tools: opts.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            },
          })),
        }
      : {}),
  };
}

function readUsage(u: Record<string, unknown>): TokenUsage {
  const usage: TokenUsage = {
    input: u.prompt_tokens as number,
    output: u.completion_tokens as number,
  };
  const cached = (u.prompt_tokens_details as Record<string, unknown> | null)
    ?.cached_tokens;
  if (typeof cached === "number") usage.cacheRead = cached;
  const reasoning = (
    u.completion_tokens_details as Record<string, unknown> | null
  )?.reasoning_tokens;
  if (typeof reasoning === "number") usage.reasoning = reasoning;
  return usage;
}

/** Parses a Chat Completions SSE stream into StreamChunks. */
export async function* parseOpenAIStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let usage: TokenUsage | undefined;
  // Tool calls stream as fragments keyed by index; flushed on finish_reason.
  const calls = new Map<number, ToolCall>();
  function* flushCalls(): Generator<StreamChunk> {
    if (calls.size === 0) return;
    const toolCalls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, c]) => ({ ...c, arguments: c.arguments || "{}" }));
    calls.clear();
    yield { delta: "", done: false, toolCalls };
  }
  const events: EventSourceMessage[] = [];
  const parser = createParser({ onEvent: (e) => events.push(e) });
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value));
    while (events.length) {
      const ev = events.shift()!;
      if (ev.data === "[DONE]") {
        yield* flushCalls();
        yield { delta: "", done: true, usage };
        return;
      }
      try {
        const obj = JSON.parse(ev.data);
        if (obj.usage) usage = readUsage(obj.usage);
        const choice = obj.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === "string" && delta) yield { delta, done: false };
        const toolDeltas = choice?.delta?.tool_calls;
        if (Array.isArray(toolDeltas)) {
          for (const td of toolDeltas) {
            const index = typeof td?.index === "number" ? td.index : 0;
            const call = calls.get(index) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (typeof td.id === "string") call.id = td.id;
            if (typeof td.function?.name === "string")
              call.name += td.function.name;
            if (typeof td.function?.arguments === "string")
              call.arguments += td.function.arguments;
            calls.set(index, call);
          }
        }
        if (choice?.finish_reason) yield* flushCalls();
      } catch {
        /* keepalive */
      }
    }
  }
  yield* flushCalls();
  yield { delta: "", done: true, usage };
}
