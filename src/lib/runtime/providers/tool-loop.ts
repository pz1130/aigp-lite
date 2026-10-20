import type {
  AdapterStreamOpts,
  ChatMessage,
  ProviderAdapter,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  ToolResultPart,
} from "./types";

/**
 * Runs a tool and returns the text the model sees as its result. A thrown
 * error is reported back to the model as a failed call, not rethrown.
 */
export type ToolHandler = (
  input: unknown,
  call: ToolCall,
) => string | Promise<string>;

export interface ToolLoopOpts extends AdapterStreamOpts {
  tools: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
  /** Model requests to make at most; the default is 8. */
  maxTurns?: number;
}

export interface ToolLoopResult {
  /** Text of the final assistant turn. */
  text: string;
  /** The input messages plus every assistant turn and tool result. */
  messages: ChatMessage[];
  /** Summed over all turns. */
  usage: TokenUsage;
  turns: number;
  /** "max_turns" when the model was still calling tools at the limit. */
  stopReason: "end_turn" | "max_turns";
}

function addUsage(total: TokenUsage, u: TokenUsage): TokenUsage {
  const sum = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  const out: TokenUsage = {
    input: total.input + u.input,
    output: total.output + u.output,
  };
  for (const key of ["cacheRead", "cacheWrite", "reasoning"] as const) {
    const v = sum(total[key], u[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

async function runTool(
  call: ToolCall,
  handlers: Record<string, ToolHandler>,
): Promise<ToolResultPart> {
  const result = (content: string, isError = false): ToolResultPart => ({
    type: "tool_result",
    toolCallId: call.id,
    name: call.name,
    content,
    ...(isError ? { isError } : {}),
  });
  const handler = Object.hasOwn(handlers, call.name)
    ? handlers[call.name]
    : undefined;
  if (!handler) return result(`Unknown tool: ${call.name}`, true);
  let input: unknown;
  try {
    input = JSON.parse(call.arguments);
  } catch {
    return result("Tool arguments were not valid JSON.", true);
  }
  try {
    return result(await handler(input, call));
  } catch (e) {
    return result(e instanceof Error ? e.message : String(e), true);
  }
}

/**
 * Calls the model, runs the tools it asks for, sends the results back, and
 * repeats until it answers without calling a tool or `maxTurns` is reached.
 */
export async function runToolLoop(
  adapter: ProviderAdapter,
  { handlers, maxTurns = 8, ...opts }: ToolLoopOpts,
): Promise<ToolLoopResult> {
  const messages = [...opts.messages];
  let usage: TokenUsage = { input: 0, output: 0 };
  let text = "";
  for (let turn = 1; turn <= maxTurns; turn++) {
    text = "";
    const toolCalls: ToolCall[] = [];
    for await (const chunk of adapter.streamChat({ ...opts, messages })) {
      if (chunk.delta) text += chunk.delta;
      if (chunk.toolCalls) toolCalls.push(...chunk.toolCalls);
      if (chunk.usage) usage = addUsage(usage, chunk.usage);
      if (chunk.done) break;
    }
    messages.push({
      role: "assistant",
      content: text,
      ...(toolCalls.length ? { toolCalls } : {}),
    });
    if (toolCalls.length === 0)
      return { text, messages, usage, turns: turn, stopReason: "end_turn" };
    opts.signal?.throwIfAborted();
    const results = await Promise.all(
      toolCalls.map((c) => runTool(c, handlers)),
    );
    messages.push({ role: "user", content: results });
  }
  return { text, messages, usage, turns: maxTurns, stopReason: "max_turns" };
}
