import { describe, it, expect, vi } from "vitest";
import { openaiCompatibleAdapter } from "./openai-compatible";

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

describe("openai-compatible adapter", () => {
  it("uses provided baseUrl for chat completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const it1 = openaiCompatibleAdapter.streamChat({
      baseUrl: "https://api.deepseek.com",
      credentials: { apiKey: "sk-x" },
      config: {},
      model: "deepseek-chat",
      messages: [{ role: "user", content: "x" }],
    });
    for await (const _ of it1) {
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.anything(),
    );
  });
});
