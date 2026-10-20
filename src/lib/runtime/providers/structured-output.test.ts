import { describe, it, expect, vi } from "vitest";
import { createOpenAIAdapter } from "./openai";
import { createAnthropicAdapter } from "./anthropic";
import { azureOpenAIAdapter } from "./azure-openai";
import { googleGeminiAdapter } from "./google-gemini";
import { openaiCompatibleAdapter } from "./openai-compatible";
import { anthropicCompatibleAdapter } from "./anthropic-compatible";
import type { AdapterStreamOpts, ProviderAdapter } from "./types";

vi.mock("@/lib/egress/guard", () => ({
  assertSafeUrl: vi.fn((url: string) => new URL(url)),
  assertSafeDestination: vi.fn(async (url: string) => new URL(url)),
  assertSafeHost: vi.fn(async () => undefined),
  safeFetch: (url: string, init?: RequestInit) => fetch(url, init),
  isBlockedIp: vi.fn(() => false),
  parseAllowlist: vi.fn(),
  EgressBlockedError: class EgressBlockedError extends Error {},
}));

const SCHEMA = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};
const FORMAT = { name: "test_output", schema: SCHEMA };

async function requestBody(
  adapter: ProviderAdapter,
  opts: Partial<AdapterStreamOpts> = {},
): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  for await (const _ of adapter.streamChat({
    baseUrl: "https://llm.example.com",
    credentials: { apiKey: "k" },
    config: {},
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    ...opts,
  })) {
  }
  return JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
}

const AZURE_CONFIG = {
  endpoint: "https://my-resource.openai.azure.com",
  deployment: "gpt-4o",
  apiVersion: "2024-08-01-preview",
};

describe("structured outputs", () => {
  it("openai sends response_format json_schema", async () => {
    const body = await requestBody(createOpenAIAdapter(), {
      responseFormat: FORMAT,
    });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "test_output", schema: SCHEMA, strict: false },
    });
  });

  it("azure-openai sends response_format json_schema", async () => {
    const body = await requestBody(azureOpenAIAdapter, {
      config: AZURE_CONFIG,
      responseFormat: FORMAT,
    });
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "test_output", schema: SCHEMA },
    });
  });

  it("anthropic sends output_config.format", async () => {
    const body = await requestBody(createAnthropicAdapter(), {
      responseFormat: FORMAT,
    });
    expect(body.output_config).toEqual({
      format: { type: "json_schema", schema: SCHEMA },
    });
  });

  it("gemini sends responseJsonSchema in generationConfig", async () => {
    const body = await requestBody(googleGeminiAdapter, {
      responseFormat: FORMAT,
    });
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
    });
  });

  it("compatible adapters never send a schema field", async () => {
    const oai = await requestBody(openaiCompatibleAdapter, {
      responseFormat: FORMAT,
    });
    expect(oai).not.toHaveProperty("response_format");
    const anth = await requestBody(anthropicCompatibleAdapter, {
      responseFormat: FORMAT,
    });
    expect(anth).not.toHaveProperty("output_config");
  });

  it("omits schema fields when responseFormat is unset", async () => {
    expect(await requestBody(createOpenAIAdapter())).not.toHaveProperty(
      "response_format",
    );
    expect(
      await requestBody(azureOpenAIAdapter, { config: AZURE_CONFIG }),
    ).not.toHaveProperty("response_format");
    expect(await requestBody(createAnthropicAdapter())).not.toHaveProperty(
      "output_config",
    );
    const gemini = await requestBody(googleGeminiAdapter);
    expect(
      (gemini.generationConfig as Record<string, unknown> | undefined)
        ?.responseJsonSchema,
    ).toBeUndefined();
  });
});
