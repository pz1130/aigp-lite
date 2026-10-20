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

/**
 * Minimal Streamable HTTP MCP server behind the mocked safeFetch: answers
 * initialize with a session id, accepts notifications, refuses the optional
 * GET stream, and serves `pages` of tools/list via nextCursor.
 */
function fakeMcpServer(pages: unknown[][], opts: { sse?: boolean } = {}) {
  return async (_url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    if (method === "GET") return new Response(null, { status: 405 });
    if (method === "DELETE") return new Response(null, { status: 200 });
    const msg = JSON.parse(init!.body as string);
    if (msg.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (msg.method === "initialize") {
      result = {
        protocolVersion: msg.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fake", version: "1.0.0" },
      };
    } else {
      const i = msg.params?.cursor ? Number(msg.params.cursor) : 0;
      result = {
        tools: pages[i],
        ...(i + 1 < pages.length ? { nextCursor: String(i + 1) } : {}),
      };
    }
    const payload = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result });
    return opts.sse
      ? new Response(`event: message\ndata: ${payload}\n\n`, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "mcp-session-id": "sess-1",
          },
        })
      : new Response(payload, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "mcp-session-id": "sess-1",
          },
        });
  };
}

/** Posted JSON-RPC calls (requests and notifications) in order. */
function postedCalls() {
  return mockedFetch.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => ({
      body: JSON.parse(init!.body as string),
      headers: new Headers(init!.headers),
    }));
}

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
  it("initializes a session, then lists tools on it", async () => {
    mockedFetch.mockImplementation(fakeMcpServer([[{ name: "t1" }]]));
    const tools = await fetchLiveTools({
      endpoint: "https://mcp.example.com",
      authTokenEnc: null,
    });
    expect(tools).toEqual([{ name: "t1" }]);
    expect(mockedFetch.mock.calls[0]![0]).toBe("https://mcp.example.com/");
    const calls = postedCalls();
    expect(calls.map((c) => c.body.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    const list = calls[2]!;
    expect(list.headers.get("accept")).toContain("text/event-stream");
    expect(list.headers.get("mcp-session-id")).toBe("sess-1");
    expect(list.headers.get("mcp-protocol-version")).toBeTruthy();
    expect(list.headers.get("authorization")).toBeNull();
  });

  it("sends decrypted bearer token when authTokenEnc is set", async () => {
    mockedFetch.mockImplementation(fakeMcpServer([[]]));
    const enc = new Uint8Array(encryptJson("sekret-token"));
    await fetchLiveTools({
      endpoint: "https://mcp.example.com",
      authTokenEnc: enc,
    });
    for (const call of postedCalls()) {
      expect(call.headers.get("authorization")).toBe("Bearer sekret-token");
    }
  });

  it("follows nextCursor across pages", async () => {
    mockedFetch.mockImplementation(
      fakeMcpServer([[{ name: "a" }], [{ name: "b" }], [{ name: "c" }]]),
    );
    const tools = await fetchLiveTools({
      endpoint: "https://mcp.example.com",
      authTokenEnc: null,
    });
    expect(tools).toEqual([{ name: "a" }, { name: "b" }, { name: "c" }]);
    const cursors = postedCalls()
      .filter((c) => c.body.method === "tools/list")
      .map((c) => c.body.params?.cursor);
    expect(cursors).toEqual([undefined, "1", "2"]);
  });

  it("reads SSE (text/event-stream) responses", async () => {
    mockedFetch.mockImplementation(
      fakeMcpServer([[{ name: "streamed" }]], { sse: true }),
    );
    const tools = await fetchLiveTools({
      endpoint: "https://mcp.example.com",
      authTokenEnc: null,
    });
    expect(tools).toEqual([{ name: "streamed" }]);
  });

  it("throws when the server errors", async () => {
    mockedFetch.mockResolvedValue(new Response("nope", { status: 500 }));
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
    mockedFetch.mockImplementation(fakeMcpServer([[{ name: "t1" }]]));
    const res = await sweepMcpDrift();
    expect(res.polled).toBe(1);
  });

  it("one failing server does not stop the sweep", async () => {
    await seedServer({ name: "fail", endpoint: "https://fail.example" });
    await seedServer({ name: "ok", endpoint: "https://ok.example" });
    const ok = fakeMcpServer([[{ name: "t1" }]]);
    mockedFetch.mockImplementation(async (url, init) => {
      if (url.startsWith("https://fail.example")) {
        throw new Error("ECONNREFUSED");
      }
      return ok(url, init);
    });
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
    mockedFetch.mockImplementation(fakeMcpServer([[{ name: "brand_new" }]]));
    const res = await sweepMcpDrift();
    expect(res.drifted).toBe(1);
  });
});
