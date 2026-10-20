import { describe, it, expect, vi } from "vitest";
import { runToolLoop } from "./tool-loop";
import type {
  AdapterStreamOpts,
  ChatMessage,
  ProviderAdapter,
  StreamChunk,
  ToolDefinition,
} from "./types";

const TOOL: ToolDefinition = {
  name: "get_weather",
  description: "Look up the weather",
  inputSchema: { type: "object", properties: { city: { type: "string" } } },
};

const BASE: AdapterStreamOpts = {
  baseUrl: "https://llm.example.com",
  credentials: { apiKey: "k" },
  config: {},
  model: "m",
  messages: [{ role: "user", content: "weather in Oslo?" }],
};

/** An adapter that replays one scripted turn per request. */
function fakeAdapter(turns: StreamChunk[][]) {
  const seen: ChatMessage[][] = [];
  const adapter: ProviderAdapter = {
    async *streamChat(opts: AdapterStreamOpts) {
      seen.push(structuredClone(opts.messages));
      const turn = turns[seen.length - 1];
      if (!turn) throw new Error("no more scripted turns");
      yield* turn;
    },
  } as unknown as ProviderAdapter;
  return { adapter, seen };
}

const callTurn = (args: string, name = "get_weather"): StreamChunk[] => [
  {
    delta: "",
    done: false,
    toolCalls: [{ id: "c1", name, arguments: args }],
  },
  { delta: "", done: true, usage: { input: 10, output: 5 } },
];

const answerTurn: StreamChunk[] = [
  { delta: "Sunny", done: false },
  { delta: ".", done: true, usage: { input: 20, output: 3 } },
];

describe("runToolLoop", () => {
  it("runs tools and sends their results back until the model answers", async () => {
    const { adapter, seen } = fakeAdapter([
      callTurn('{"city":"Oslo"}'),
      answerTurn,
    ]);
    const handler = vi.fn(() => "12C, clear");
    const result = await runToolLoop(adapter, {
      ...BASE,
      tools: [TOOL],
      handlers: { get_weather: handler },
    });

    expect(handler).toHaveBeenCalledWith(
      { city: "Oslo" },
      { id: "c1", name: "get_weather", arguments: '{"city":"Oslo"}' },
    );
    expect(result).toMatchObject({
      text: "Sunny.",
      turns: 2,
      stopReason: "end_turn",
    });
    expect(result.usage).toEqual({ input: 30, output: 8 });
    expect(seen[1].slice(1)).toEqual([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "c1", name: "get_weather", arguments: '{"city":"Oslo"}' },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            toolCallId: "c1",
            name: "get_weather",
            content: "12C, clear",
          },
        ],
      },
    ]);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Sunny.",
    });
    // The caller's array is left alone.
    expect(BASE.messages).toHaveLength(1);
  });

  it.each([
    ["an unknown tool", callTurn("{}", "toString"), "Unknown tool: toString"],
    [
      "invalid JSON arguments",
      callTurn("{oops"),
      "Tool arguments were not valid JSON.",
    ],
    ["a handler that throws", callTurn("{}"), "boom"],
  ])("reports %s to the model as an error", async (_label, turn, message) => {
    const { adapter, seen } = fakeAdapter([turn, answerTurn]);
    await runToolLoop(adapter, {
      ...BASE,
      tools: [TOOL],
      handlers: {
        get_weather: () => {
          throw new Error("boom");
        },
      },
    });
    const results = seen[1].at(-1)?.content;
    expect(results).toEqual([
      expect.objectContaining({ content: message, isError: true }),
    ]);
  });

  it("stops at maxTurns while the model keeps calling tools", async () => {
    const { adapter, seen } = fakeAdapter([
      callTurn("{}"),
      callTurn("{}"),
      callTurn("{}"),
    ]);
    const result = await runToolLoop(adapter, {
      ...BASE,
      tools: [TOOL],
      handlers: { get_weather: () => "ok" },
      maxTurns: 2,
    });
    expect(seen).toHaveLength(2);
    expect(result).toMatchObject({ turns: 2, stopReason: "max_turns" });
  });

  it("sums detailed usage only for the keys providers report", async () => {
    const { adapter } = fakeAdapter([
      [
        {
          delta: "",
          done: true,
          toolCalls: [{ id: "c1", name: "get_weather", arguments: "{}" }],
          usage: { input: 10, output: 5, cacheRead: 4 },
        },
      ],
      [
        {
          delta: "done",
          done: true,
          usage: { input: 12, output: 2, cacheRead: 8, reasoning: 1 },
        },
      ],
    ]);
    const result = await runToolLoop(adapter, {
      ...BASE,
      tools: [TOOL],
      handlers: { get_weather: () => "ok" },
    });
    expect(result.usage).toEqual({
      input: 22,
      output: 7,
      cacheRead: 12,
      reasoning: 1,
    });
    expect(result.usage).not.toHaveProperty("cacheWrite");
  });

  it("stops before running tools once the signal is aborted", async () => {
    const controller = new AbortController();
    const { adapter } = fakeAdapter([callTurn("{}")]);
    const handler = vi.fn(() => "ok");
    controller.abort();
    await expect(
      runToolLoop(adapter, {
        ...BASE,
        signal: controller.signal,
        tools: [TOOL],
        handlers: { get_weather: handler },
      }),
    ).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
