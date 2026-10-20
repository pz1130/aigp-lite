import { describe, it, expect, vi } from "vitest";
import { createOpenAIAdapter } from "./openai";
import { createAnthropicAdapter } from "./anthropic";
import { azureOpenAIAdapter } from "./azure-openai";
import { googleGeminiAdapter } from "./google-gemini";
import type {
  AdapterStreamOpts,
  ChatMessage,
  ProviderAdapter,
  StreamChunk,
  ToolDefinition,
} from "./types";

vi.mock("@/lib/egress/guard", () => ({
  assertSafeUrl: vi.fn((url: string) => new URL(url)),
  assertSafeDestination: vi.fn(async (url: string) => new URL(url)),
  assertSafeHost: vi.fn(async () => undefined),
  safeFetch: (url: string, init?: RequestInit) => fetch(url, init),
  isBlockedIp: vi.fn(() => false),
  parseAllowlist: vi.fn(),
  EgressBlockedError: class EgressBlockedError extends Error {},
}));

const AZURE_CONFIG = {
  endpoint: "https://my-resource.openai.azure.com",
  deployment: "gpt-4o",
  apiVersion: "2024-08-01-preview",
};

const TOOL: ToolDefinition = {
  name: "get_weather",
  description: "Look up the weather",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

const IMAGE_MESSAGE: ChatMessage = {
  role: "user",
  content: [
    { type: "text", text: "what is this?" },
    { type: "image", mediaType: "image/png", data: "aGVsbG8=" },
  ],
};

function sse(lines: string[]): Response {
  const body = lines.join("");
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(body));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function stubFetch(lines: string[] = []) {
  const fetchMock = vi.fn().mockResolvedValue(sse(lines));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function collect(
  adapter: ProviderAdapter,
  opts: Partial<AdapterStreamOpts> = {},
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const c of adapter.streamChat({
    baseUrl: "https://llm.example.com",
    credentials: { apiKey: "k" },
    config: {},
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    ...opts,
  })) {
    chunks.push(c);
  }
  return chunks;
}

async function requestBody(
  adapter: ProviderAdapter,
  opts: Partial<AdapterStreamOpts> = {},
): Promise<Record<string, unknown>> {
  const fetchMock = stubFetch();
  await collect(adapter, opts);
  return JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
}

const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const event = (name: string, obj: unknown) =>
  `event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`;

describe.each([
  ["openai", createOpenAIAdapter(), {}],
  ["azure-openai", azureOpenAIAdapter, AZURE_CONFIG],
] as const)("%s capabilities", (_name, adapter, config) => {
  it("sends image parts and tools in Chat Completions form", async () => {
    const body = await requestBody(adapter, {
      config,
      messages: [IMAGE_MESSAGE],
      tools: [TOOL],
    });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,aGVsbG8=" },
          },
        ],
      },
    ]);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Look up the weather",
          parameters: TOOL.inputSchema,
        },
      },
    ]);
  });

  it("omits tools and keeps string content when none are given", async () => {
    const body = await requestBody(adapter, { config });
    expect(body).not.toHaveProperty("tools");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("merges streamed tool_call fragments into one call", async () => {
    stubFetch([
      data({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_abc",
                  function: { name: "get_weather", arguments: "" },
                },
              ],
            },
          },
        ],
      }),
      data({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"city":' } }],
            },
          },
        ],
      }),
      data({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"Oslo"}' } }],
            },
          },
        ],
      }),
      data({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      "data: [DONE]\n\n",
    ]);
    const chunks = await collect(adapter, { config, tools: [TOOL] });
    const calls = chunks.flatMap((c) => c.toolCalls ?? []);
    expect(calls).toEqual([
      { id: "call_abc", name: "get_weather", arguments: '{"city":"Oslo"}' },
    ]);
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it("reports cached and reasoning tokens", async () => {
    stubFetch([
      data({ choices: [{ delta: { content: "ok" } }] }),
      data({
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 40,
          prompt_tokens_details: { cached_tokens: 64 },
          completion_tokens_details: { reasoning_tokens: 30 },
        },
      }),
      "data: [DONE]\n\n",
    ]);
    const chunks = await collect(adapter, { config });
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: { input: 100, output: 40, cacheRead: 64, reasoning: 30 },
    });
  });

  it("leaves usage as input/output when details are absent", async () => {
    stubFetch([
      data({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
      "data: [DONE]\n\n",
    ]);
    const chunks = await collect(adapter, { config });
    expect(chunks.at(-1)?.usage).toEqual({ input: 5, output: 2 });
  });
});

describe("anthropic capabilities", () => {
  const adapter = createAnthropicAdapter();

  it("sends image parts as base64 sources and tools with input_schema", async () => {
    const body = await requestBody(adapter, {
      messages: [{ role: "system", content: "be brief" }, IMAGE_MESSAGE],
      tools: [TOOL],
    });
    expect(body.system).toBe("be brief");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "aGVsbG8=",
            },
          },
        ],
      },
    ]);
    expect(body.tools).toEqual([
      {
        name: "get_weather",
        description: "Look up the weather",
        input_schema: TOOL.inputSchema,
      },
    ]);
  });

  it("sends url image sources", async () => {
    const body = await requestBody(adapter, {
      messages: [
        {
          role: "user",
          content: [{ type: "image", url: "https://img.example.com/a.png" }],
        },
      ],
    });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: "https://img.example.com/a.png" },
          },
        ],
      },
    ]);
  });

  it("yields tool_use blocks as tool calls and reports cache usage", async () => {
    stubFetch([
      event("message_start", {
        type: "message_start",
        message: {
          usage: {
            input_tokens: 12,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 50,
          },
        },
      }),
      event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Checking." },
      }),
      event("content_block_stop", { type: "content_block_stop", index: 0 }),
      event("content_block_start", {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_1",
          name: "get_weather",
          input: {},
        },
      }),
      event("content_block_delta", {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"city":' },
      }),
      event("content_block_delta", {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '"Oslo"}' },
      }),
      event("content_block_stop", { type: "content_block_stop", index: 1 }),
      event("content_block_start", {
        type: "content_block_start",
        index: 2,
        content_block: { type: "tool_use", id: "toolu_2", name: "now" },
      }),
      event("content_block_stop", { type: "content_block_stop", index: 2 }),
      event("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 9 },
      }),
      event("message_stop", { type: "message_stop" }),
    ]);
    const chunks = await collect(adapter, { tools: [TOOL] });
    expect(chunks.map((c) => c.delta).join("")).toBe("Checking.");
    expect(chunks.flatMap((c) => c.toolCalls ?? [])).toEqual([
      { id: "toolu_1", name: "get_weather", arguments: '{"city":"Oslo"}' },
      { id: "toolu_2", name: "now", arguments: "{}" },
    ]);
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: { input: 12, output: 9, cacheRead: 800, cacheWrite: 50 },
    });
  });
});

describe("gemini capabilities", () => {
  it("sends inlineData images and functionDeclarations", async () => {
    const body = await requestBody(googleGeminiAdapter, {
      messages: [IMAGE_MESSAGE],
      tools: [TOOL],
    });
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [
          { text: "what is this?" },
          { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } },
        ],
      },
    ]);
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "get_weather",
            description: "Look up the weather",
            parameters: TOOL.inputSchema,
          },
        ],
      },
    ]);
  });

  it("yields functionCall parts as tool calls with generated ids", async () => {
    stubFetch([
      data({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "get_weather", args: { city: "Oslo" } },
                },
                { functionCall: { name: "now" } },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 7,
          cachedContentTokenCount: 16,
          thoughtsTokenCount: 11,
        },
      }),
    ]);
    const chunks = await collect(googleGeminiAdapter, { tools: [TOOL] });
    expect(chunks.flatMap((c) => c.toolCalls ?? [])).toEqual([
      { id: "call_0", name: "get_weather", arguments: '{"city":"Oslo"}' },
      { id: "call_1", name: "now", arguments: "{}" },
    ]);
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: { input: 20, output: 7, cacheRead: 16, reasoning: 11 },
    });
  });
});

const TOOL_ROUND: ChatMessage[] = [
  { role: "user", content: "weather in Oslo?" },
  {
    role: "assistant",
    content: "Checking.",
    toolCalls: [
      {
        id: "c1",
        name: "get_weather",
        arguments: '{"city":"Oslo"}',
        signature: "sig-1",
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        toolCallId: "c1",
        name: "get_weather",
        content: "12C",
      },
      {
        type: "tool_result",
        toolCallId: "c2",
        name: "get_weather",
        content: "timeout",
        isError: true,
      },
      { type: "text", text: "and tomorrow?" },
    ],
  },
];

describe("tool result passback", () => {
  it.each([
    ["openai", createOpenAIAdapter(), {}],
    ["azure-openai", azureOpenAIAdapter, AZURE_CONFIG],
  ] as const)(
    "%s sends tool_calls and tool messages",
    async (_n, adapter, config) => {
      const body = await requestBody(adapter, {
        config,
        messages: TOOL_ROUND,
        tools: [TOOL],
      });
      expect(body.messages).toEqual([
        { role: "user", content: "weather in Oslo?" },
        {
          role: "assistant",
          content: "Checking.",
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"Oslo"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: "12C" },
        { role: "tool", tool_call_id: "c2", content: "timeout" },
        { role: "user", content: [{ type: "text", text: "and tomorrow?" }] },
      ]);
    },
  );

  it("openai sends null content for an assistant turn with only tool calls", async () => {
    const body = await requestBody(createOpenAIAdapter(), {
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "c1", name: "now", arguments: "{}" }],
        },
      ],
    });
    expect((body.messages as Record<string, unknown>[])[0].content).toBeNull();
  });

  it("anthropic sends tool_use and tool_result blocks", async () => {
    const body = await requestBody(createAnthropicAdapter(), {
      messages: TOOL_ROUND,
      tools: [TOOL],
    });
    expect(body.messages).toEqual([
      { role: "user", content: "weather in Oslo?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking." },
          {
            type: "tool_use",
            id: "c1",
            name: "get_weather",
            input: { city: "Oslo" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "c1", content: "12C" },
          {
            type: "tool_result",
            tool_use_id: "c2",
            content: "timeout",
            is_error: true,
          },
          { type: "text", text: "and tomorrow?" },
        ],
      },
    ]);
  });

  it("gemini sends functionCall with its thought signature and functionResponse", async () => {
    const body = await requestBody(googleGeminiAdapter, {
      messages: TOOL_ROUND,
      tools: [TOOL],
    });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "weather in Oslo?" }] },
      {
        role: "model",
        parts: [
          { text: "Checking." },
          {
            functionCall: { name: "get_weather", args: { city: "Oslo" } },
            thoughtSignature: "sig-1",
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "get_weather",
              response: { result: "12C" },
            },
          },
          {
            functionResponse: {
              name: "get_weather",
              response: { error: "timeout" },
            },
          },
          { text: "and tomorrow?" },
        ],
      },
    ]);
  });

  it("gemini keeps the thought signature of a streamed functionCall", async () => {
    stubFetch([
      data({
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { name: "now" }, thoughtSignature: "sig-9" },
              ],
            },
          },
        ],
      }),
    ]);
    const chunks = await collect(googleGeminiAdapter, { tools: [TOOL] });
    expect(chunks.flatMap((c) => c.toolCalls ?? [])).toEqual([
      { id: "call_0", name: "now", arguments: "{}", signature: "sig-9" },
    ]);
  });
});
