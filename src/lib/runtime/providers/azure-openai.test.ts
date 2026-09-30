import { describe, it, expect, vi } from "vitest";
import { azureOpenAIAdapter } from "./azure-openai";

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

describe("azure-openai adapter", () => {
  it("builds URL from endpoint + deployment + apiVersion and uses api-key header", async () => {
    const enc = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(`data: [DONE]\n\n`));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    for await (const _ of azureOpenAIAdapter.streamChat({
      baseUrl: "",
      credentials: { apiKey: "azure-key" },
      config: {
        endpoint: "https://my-resource.openai.azure.com",
        deployment: "gpt-4o",
        apiVersion: "2024-08-01-preview",
      },
      model: "ignored",
      messages: [{ role: "user", content: "hi" }],
    })) {
    }
    const callUrl: string = fetchMock.mock.calls[0][0];
    expect(callUrl).toBe(
      "https://my-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview",
    );
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["api-key"]).toBe("azure-key");
  });

  it("throws on missing endpoint/deployment/apiVersion", async () => {
    await expect(
      (async () => {
        for await (const _ of azureOpenAIAdapter.streamChat({
          baseUrl: "",
          credentials: { apiKey: "k" },
          config: {},
          model: "m",
          messages: [{ role: "user", content: "x" }],
        })) {
        }
      })(),
    ).rejects.toThrow(/azure/);
  });
});
