// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getEmbeddingConnection, embedText } from "../embed";

vi.mock("@/lib/crypto/secrets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crypto/secrets")>(
    "@/lib/crypto/secrets",
  );
  return {
    ...actual,
    decryptJson: (b: Buffer | Uint8Array) => ({
      apiKey: Buffer.from(b).toString(),
    }),
  };
});

const ORG = "org-embed-test";

beforeEach(async () => {
  await prisma.llmInvocation.deleteMany({ where: { orgId: ORG } });
  await prisma.providerConnection.deleteMany({ where: { orgId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.organization.create({ data: { id: ORG, name: "T" } });
});

afterEach(() => vi.restoreAllMocks());

describe("getEmbeddingConnection", () => {
  it("returns null when no connection has supportsEmbeddings", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "no-embed",
        providerType: "openai",
        credentialsEncrypted: Buffer.from(""),
        config: {},
        createdBy: "u",
      },
    });
    expect(await getEmbeddingConnection(ORG)).toBeNull();
  });

  it("returns the oldest active connection with supportsEmbeddings=true", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "first",
        providerType: "openai",
        credentialsEncrypted: Buffer.from(""),
        config: { supportsEmbeddings: true },
        isActive: true,
        createdBy: "u",
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "second",
        providerType: "openai",
        credentialsEncrypted: Buffer.from(""),
        config: { supportsEmbeddings: true },
        isActive: true,
        createdBy: "u",
      },
    });
    const conn = await getEmbeddingConnection(ORG);
    expect(conn?.name).toBe("first");
  });

  it("skips inactive connections", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "off",
        providerType: "openai",
        credentialsEncrypted: Buffer.from(""),
        config: { supportsEmbeddings: true },
        isActive: false,
        createdBy: "u",
      },
    });
    expect(await getEmbeddingConnection(ORG)).toBeNull();
  });
});

describe("embedText", () => {
  it("returns null when no provider is available", async () => {
    expect(await embedText(ORG, "hello")).toBeNull();
  });

  it("calls the provider, returns the vector, writes an LlmInvocation row", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "p",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        credentialsEncrypted: Buffer.from("sk-fake"),
        config: { supportsEmbeddings: true },
        isActive: true,
        createdBy: "u",
      },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { prompt_tokens: 7 },
          model: "text-embedding-3-small",
        }),
        { status: 200 },
      ),
    );

    const vec = await embedText(ORG, "hello world");

    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const inv = await prisma.llmInvocation.findFirst({
      where: { orgId: ORG, model: "text-embedding-3-small" },
    });
    expect(inv?.inputTokens).toBe(7);
    expect(inv?.outputTokens).toBe(0);
  });

  it("blocks a private-IP baseUrl (SSRF) without calling fetch and degrades to null", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "ssrf",
        providerType: "openai",
        baseUrl: "http://169.254.169.254",
        credentialsEncrypted: Buffer.from("sk-fake"),
        config: { supportsEmbeddings: true },
        isActive: true,
        createdBy: "u",
      },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const vec = await embedText(ORG, "hello");

    expect(vec).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    const count = await prisma.llmInvocation.count({ where: { orgId: ORG } });
    expect(count).toBe(0);
  });

  it("returns null and increments no LlmInvocation when provider errors", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "p",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        credentialsEncrypted: Buffer.from("sk-fake"),
        config: { supportsEmbeddings: true },
        isActive: true,
        createdBy: "u",
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oops", { status: 500 }),
    );
    const vec = await embedText(ORG, "hello");
    expect(vec).toBeNull();
    const count = await prisma.llmInvocation.count({ where: { orgId: ORG } });
    expect(count).toBe(0);
  });
});
