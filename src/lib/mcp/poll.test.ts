import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto/secrets";

vi.mock("@/lib/egress/guard", () => ({
  safeFetch: vi.fn(),
  EgressBlockedError: class EgressBlockedError extends Error {},
}));
import { safeFetch } from "@/lib/egress/guard";
import { fetchLiveTools, sweepMcpDrift } from "./poll";
import { recordSnapshot } from "./snapshots";

const mockedFetch = vi.mocked(safeFetch);

let orgId: string;
let userId: string;

const rpcOk = (tools: unknown[]) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools } }), {
    status: 200,
  });

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `MCP poll ${Date.now()}` },
  });
  orgId = org.id;
  const u = await prisma.user.create({
    data: { email: `mcp-poll-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.create({
    data: { orgId, userId, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.mcpToolSnapshot.deleteMany({ where: { orgId } });
  await prisma.mcpServer.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.mcpToolSnapshot.deleteMany({ where: { orgId } });
  await prisma.mcpServer.deleteMany({ where: { orgId } });
});

async function seedServer(
  overrides: Partial<{
    name: string;
    transport: "stdio" | "http";
    status: "active" | "inactive" | "archived";
    authType: "none" | "token" | "oauth";
    endpoint: string;
  }> = {},
) {
  return prisma.mcpServer.create({
    data: {
      orgId,
      name: overrides.name ?? "srv",
      endpoint: overrides.endpoint ?? "https://mcp.example.com",
      transport: overrides.transport ?? "http",
      authType: overrides.authType ?? "none",
      status: overrides.status ?? "active",
      createdById: userId,
    },
  });
}

describe("fetchLiveTools", () => {
  it("POSTs JSON-RPC tools/list and returns the tools array", async () => {
    mockedFetch.mockResolvedValueOnce(rpcOk([{ name: "t1" }]));
    const tools = await fetchLiveTools({
      endpoint: "https://mcp.example.com",
      authTokenEnc: null,
    });
    expect(tools).toEqual([{ name: "t1" }]);
    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe("https://mcp.example.com");
    expect(JSON.parse(init!.body as string).method).toBe("tools/list");
    expect(
      (init!.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it("sends decrypted bearer token when authTokenEnc is set", async () => {
    mockedFetch.mockResolvedValueOnce(rpcOk([]));
    const enc = new Uint8Array(encryptJson("sekret-token"));
    await fetchLiveTools({
      endpoint: "https://mcp.example.com",
      authTokenEnc: enc,
    });
    const [, init] = mockedFetch.mock.calls[0]!;
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer sekret-token",
    );
  });

  it("throws on non-200 and on missing result.tools", async () => {
    mockedFetch.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(
      fetchLiveTools({ endpoint: "https://x.example", authTokenEnc: null }),
    ).rejects.toThrow();
  });
});

describe("sweepMcpDrift", () => {
  it("polls only active http servers with authType none/token", async () => {
    await seedServer({ name: "pollable", authType: "none" });
    await seedServer({ name: "oauth", authType: "oauth" });
    await seedServer({ name: "stdio", transport: "stdio" });
    await seedServer({ name: "inactive", status: "inactive" });
    mockedFetch.mockResolvedValue(rpcOk([{ name: "t1" }]));
    const res = await sweepMcpDrift();
    expect(res.polled).toBe(1);
  });

  it("one failing server does not stop the sweep", async () => {
    await seedServer({ name: "fail", endpoint: "https://fail.example" });
    await seedServer({ name: "ok", endpoint: "https://ok.example" });
    mockedFetch
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(rpcOk([{ name: "t1" }]));
    const res = await sweepMcpDrift();
    expect(res.failed).toBe(1);
    expect(res.polled).toBe(2);
    expect(
      await prisma.mcpServer.count({
        where: { driftStatus: "pending_review" },
      }),
    ).toBe(0);
  });

  it("counts drifted servers", async () => {
    const server = await seedServer({ name: "drift-target" });
    await recordSnapshot({
      serverId: server.id,
      orgId,
      tools: [{ name: "old" }],
      source: "manual",
    });
    mockedFetch.mockResolvedValueOnce(rpcOk([{ name: "brand_new" }]));
    const res = await sweepMcpDrift();
    expect(res.drifted).toBe(1);
  });
});
