import { describe, it, expect, vi } from "vitest";
import { createOpenAIAdapter } from "./openai";
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

function mockFetch(body: string, status = 200) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
  return vi.fn().mockResolvedValue(
    new Response(stream, {
      status,
      headers: { "content-type": "text/event-stream" },
    }),
  );
}

describe("openai adapter", () => {
  it("yields delta chunks from SSE stream", async () => {
    const sse =
      `data: {"choices":[{"delta":{"content":"hel"}}]}\n\n` +
      `data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n` +
      `data: [DONE]\n\n`;
    vi.stubGlobal("fetch", mockFetch(sse));
    const adapter = createOpenAIAdapter();
    const chunks: StreamChunk[] = [];
    for await (const c of adapter.streamChat({
      baseUrl: "https://api.openai.com/v1",
      credentials: { apiKey: "sk-test" },
      config: {},
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }))
      chunks.push(c);
    const text = chunks
      .filter((c) => c.delta)
      .map((c) => c.delta)
      .join("");
    expect(text).toBe("hello");
    const last = chunks.at(-1);
    expect(last?.done).toBe(true);
    expect(last?.usage).toEqual({ input: 5, output: 2 });
  });

  it("throws when upstream returns non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("auth fail", { status: 401 })),
    );
    const adapter = createOpenAIAdapter();
    await expect(
      (async () => {
        for await (const _ of adapter.streamChat({
          baseUrl: "x",
          credentials: { apiKey: "x" },
          config: {},
          model: "x",
          messages: [{ role: "user", content: "x" }],
        })) {
        }
      })(),
    ).rejects.toThrow(/openai/);
  });

  it("ping returns ok on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );
    const adapter = createOpenAIAdapter();
    const r = await adapter.ping({
      baseUrl: "https://api.openai.com/v1",
      credentials: { apiKey: "sk" },
      config: {},
      model: "gpt-4o-mini",
      messages: [],
    });
    expect(r.ok).toBe(true);
  });
});
