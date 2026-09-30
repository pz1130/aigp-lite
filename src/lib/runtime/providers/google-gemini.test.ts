import { describe, it, expect, vi } from "vitest";
import { googleGeminiAdapter } from "./google-gemini";
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

describe("google-gemini adapter", () => {
  it("translates messages to contents[] and yields text deltas", async () => {
    const enc = new TextEncoder();
    const body =
      `data: {"candidates":[{"content":{"parts":[{"text":"hel"}]}}]}\n\n` +
      `data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":2}}\n\n`;
    const fetchMock = vi.fn().mockResolvedValue(
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
    vi.stubGlobal("fetch", fetchMock);
    const chunks: StreamChunk[] = [];
    for await (const c of googleGeminiAdapter.streamChat({
      baseUrl: "https://generativelanguage.googleapis.com",
      credentials: { apiKey: "gk" },
      config: {},
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
    }))
      chunks.push(c);

    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain(
      "/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=gk",
    );
    const body0 = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    ) as {
      systemInstruction?: { parts?: Array<{ text?: string }> };
      contents: unknown[];
    };
    expect(body0.systemInstruction?.parts?.[0]?.text).toBe("be brief");
    expect(body0.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "hi" }],
    });

    expect(
      chunks
        .filter((c) => c.delta)
        .map((c) => c.delta)
        .join(""),
    ).toBe("hello");
    expect(chunks.at(-1)?.usage).toEqual({ input: 7, output: 2 });
  });
});
