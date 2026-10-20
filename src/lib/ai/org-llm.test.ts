// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling; these tests are server-only.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import type { ProviderType } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto/secrets";
import {
  hasOrgLlm,
  NoModelError,
  NoProviderError,
  resolveLlm,
  resolveOrgLlm,
} from "./org-llm";

const ORG = "org-test-org-llm";

async function addConn(
  name: string,
  providerType: ProviderType,
  opts: {
    baseUrl?: string | null;
    config?: Record<string, unknown>;
    isActive?: boolean;
    createdAt?: Date;
  } = {},
) {
  await prisma.providerConnection.create({
    data: {
      orgId: ORG,
      name,
      providerType,
      baseUrl: opts.baseUrl ?? null,
      credentialsEncrypted: new Uint8Array(
        encryptJson({ apiKey: `k-${name}` }),
      ),
      config: (opts.config ?? {}) as object,
      isActive: opts.isActive ?? true,
      createdAt: opts.createdAt,
      createdBy: "test",
    },
  });
}

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.organization.create({ data: { id: ORG, name: "Org LLM" } });
});

afterAll(async () => {
  await prisma.providerConnection.deleteMany({ where: { orgId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
});

beforeEach(async () => {
  await prisma.providerConnection.deleteMany({ where: { orgId: ORG } });
});

describe("resolveOrgLlm", () => {
  it("throws NoProviderError when the org has no connections", async () => {
    await expect(resolveOrgLlm(ORG)).rejects.toBeInstanceOf(NoProviderError);
    expect(await hasOrgLlm(ORG)).toBe(false);
  });

  it("uses the provider default model and base URL", async () => {
    await addConn("a", "anthropic");
    const r = await resolveOrgLlm(ORG);
    expect(r).toMatchObject({
      providerType: "anthropic",
      baseUrl: "https://api.anthropic.com",
      credentials: { apiKey: "k-a" },
      model: "claude-sonnet-4-6",
      source: "org",
    });
    expect(await hasOrgLlm(ORG)).toBe(true);
  });

  it("prefers config.defaultModel over the hardcoded default", async () => {
    await addConn("o", "openai", {
      baseUrl: "https://proxy.example.com",
      config: { defaultModel: " gpt-5-mini " },
    });
    const r = await resolveOrgLlm(ORG);
    expect(r.model).toBe("gpt-5-mini");
    expect(r.baseUrl).toBe("https://proxy.example.com");
  });

  it("uses the azure deployment as the model", async () => {
    await addConn("az", "azure_openai", {
      config: { endpoint: "https://x.openai.azure.com", deployment: "dep-1" },
    });
    expect((await resolveOrgLlm(ORG)).model).toBe("dep-1");
  });

  it("skips inactive connections", async () => {
    await addConn("off", "anthropic", { isActive: false });
    await expect(resolveOrgLlm(ORG)).rejects.toBeInstanceOf(NoProviderError);
    expect(await hasOrgLlm(ORG)).toBe(false);
  });

  it("skips connections without a model and picks the next usable one", async () => {
    await addConn("compat", "openai_compatible", {
      baseUrl: "https://unknown.example.com",
      createdAt: new Date("2024-01-01"),
    });
    await addConn("g", "google_gemini", {
      createdAt: new Date("2024-02-01"),
    });
    const r = await resolveOrgLlm(ORG);
    expect(r.providerType).toBe("google_gemini");
    expect(r.model).toBe("gemini-2.5-flash");
  });

  it("throws NoModelError when no connection has a resolvable model", async () => {
    await addConn("compat", "openai_compatible", {
      baseUrl: "https://unknown.example.com",
    });
    await expect(resolveOrgLlm(ORG)).rejects.toBeInstanceOf(NoModelError);
    expect(await hasOrgLlm(ORG)).toBe(false);
  });
});

describe("resolveLlm", () => {
  const env = () => ({
    kind: "openai" as const,
    apiKey: "env-key",
    model: "gpt-env",
  });

  it("prefers the org connection over env config", async () => {
    await addConn("a", "anthropic");
    const r = await resolveLlm(ORG, env);
    expect(r.source).toBe("org");
    expect(r.providerType).toBe("anthropic");
  });

  it("falls back to env config when the org has no usable connection", async () => {
    const r = await resolveLlm(ORG, env);
    expect(r).toMatchObject({
      providerType: "openai",
      baseUrl: "https://api.openai.com",
      credentials: { apiKey: "env-key" },
      model: "gpt-env",
      source: "env",
    });
  });

  it("propagates the env fallback's error when nothing is configured", async () => {
    await expect(
      resolveLlm(ORG, () => {
        throw new Error("feature not configured");
      }),
    ).rejects.toThrow("feature not configured");
  });
});
