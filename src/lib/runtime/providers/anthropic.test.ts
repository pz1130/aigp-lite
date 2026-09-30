import { describe, it, expect, vi } from "vitest";
import { createAnthropicAdapter } from "./anthropic";
import type { StreamChunk } from "./types";

vi.mock("@/lib/egress/guard", () => ({
  assertSafeUrl: vi.fn((url: string) => new URL(url)),
  assertSafeDestination: vi.fn(async (url: string) => new URL(url)),
  assertSafeHost: vi.fn(async () => undefined),
  // Delegate to the *global* fetch at call time so vi.stubGlobal("fetch")
  // stubs are honored; init passes through untouched so exact-init
  // assertions stay green.
  safeFetch: (url: string, init?: RequestInit) => fetch(url, init),
  isBlockedIp: vi.fn(() => false),
  parseAllowlist: vi.fn(),
  EgressBlockedError: class EgressBlockedError extends Error {},
}));

function mockSse(body: string) {
  const enc = new TextEncoder();
  return vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(body));
          c.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  );
}

describe("anthropic adapter", () => {
  it("captures input_tokens from message_start (not 0)", async () => {
    const sse =
      `event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":17,"output_tokens":0}}}\n\n` +
      `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n` +
      `event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n` +
      `event: message_stop\ndata: {"type":"message_stop"}\n\n`;
    vi.stubGlobal("fetch", mockSse(sse));
    const adapter = createAnthropicAdapter();
    const chunks: StreamChunk[] = [];
    for await (const c of adapter.streamChat({
      baseUrl: "https://api.anthropic.com",
      credentials: { apiKey: "k" },
      config: {},
      model: "claude",
      messages: [{ role: "user", content: "hi" }],
    }))
      chunks.push(c);
    const last = chunks.at(-1);
    expect(last).toMatchObject({
      done: true,
      usage: { input: 17, output: 3 },
    });
  });
});
