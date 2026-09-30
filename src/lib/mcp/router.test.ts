// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

let orgId: string;
let otherOrgId: string;
let userId: string;

function makeCtx(uid: string, oid: string): TRPCContext {
  return {
    session: {
      userId: uid,
      orgId: oid,
      role: "admin",
      email: `${uid}@x`,
    },
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `MCP ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `MCP2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const u = await prisma.user.create({
    data: { email: `mcp-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId, role: "admin" },
      { orgId: otherOrgId, userId, role: "admin" },
    ],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpToolSnapshot.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpToolInvocation.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpTool.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpServer.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpToolSnapshot.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpToolInvocation.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpTool.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.mcpServer.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
});

let serverId: string;

async function seedServer(name = "Test Server") {
  const server = await prisma.mcpServer.create({
    data: {
      orgId,
      name,
      endpoint: "https://mcp.example.com",
      transport: "http",
      createdById: userId,
    },
  });
  serverId = server.id;
  return server;
}

describe("mcp.create", () => {
  it("creates server with tools", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.create({
      name: "Test Server",
      endpoint: "https://mcp.example.com",
      transport: "http",
      authType: "token",
      riskTier: "high",
      tools: [
        { name: "search", description: "Search tool", riskTier: "medium" },
        { name: "execute", riskTier: "high" },
      ],
    });
    expect(r.name).toBe("Test Server");
    expect(r.tools).toHaveLength(2);
    expect(r.riskTier).toBe("high");
  });

  it("creates server without tools", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.create({
      name: "Empty Server",
      endpoint: "stdio:///bin/tool",
      transport: "stdio",
    });
    expect(r.tools).toHaveLength(0);
    expect(r.riskTier).toBe("medium");
  });
});

describe("mcp.list", () => {
  it("returns servers for org only", async () => {
    await prisma.mcpServer.create({
      data: {
        orgId,
        name: "A",
        endpoint: "http://a",
        transport: "http",
        createdById: userId,
      },
    });
    await prisma.mcpServer.create({
      data: {
        orgId: otherOrgId,
        name: "B",
        endpoint: "http://b",
        transport: "http",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.list();
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("A");
  });

  it("filters by status", async () => {
    await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Active",
        endpoint: "http://a",
        transport: "http",
        status: "active",
        createdById: userId,
      },
    });
    await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Archived",
        endpoint: "http://b",
        transport: "http",
        status: "archived",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.list({ status: "active" });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Active");
  });

  it("filters by riskTier", async () => {
    await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Low",
        endpoint: "http://a",
        transport: "http",
        riskTier: "low",
        createdById: userId,
      },
    });
    await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Critical",
        endpoint: "http://b",
        transport: "http",
        riskTier: "critical",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.list({ riskTier: "critical" });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Critical");
  });
});

describe("mcp.byId", () => {
  it("returns server with tools and invocations", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "S",
        endpoint: "http://s",
        transport: "http",
        createdById: userId,
      },
    });
    await prisma.mcpTool.create({
      data: { serverId: server.id, orgId, name: "t1", riskTier: "low" },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.byId({ id: server.id });
    expect(r!.name).toBe("S");
    expect(r!.tools).toHaveLength(1);
  });

  it("returns null for wrong org", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId: otherOrgId,
        name: "Other",
        endpoint: "http://o",
        transport: "http",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.byId({ id: server.id });
    expect(r).toBeNull();
  });
});

describe("mcp.update", () => {
  it("updates server fields", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Old",
        endpoint: "http://old",
        transport: "http",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.update({
      id: server.id,
      name: "New",
      riskTier: "critical",
    });
    expect(r.name).toBe("New");
    expect(r.riskTier).toBe("critical");
  });

  it("replaces tools when tools array provided", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "S",
        endpoint: "http://s",
        transport: "http",
        createdById: userId,
      },
    });
    await prisma.mcpTool.create({
      data: { serverId: server.id, orgId, name: "old-tool", riskTier: "low" },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.update({
      id: server.id,
      tools: [{ name: "new-tool", riskTier: "high" }],
    });
    expect(r.tools).toHaveLength(1);
    expect(r.tools[0].name).toBe("new-tool");
  });
});

describe("mcp.remove", () => {
  it("sets status to archived", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "S",
        endpoint: "http://s",
        transport: "http",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.mcp.remove({ id: server.id });
    const updated = await prisma.mcpServer.findUnique({
      where: { id: server.id },
    });
    expect(updated!.status).toBe("archived");
  });
});

describe("mcp.logInvocation", () => {
  it("creates invocation record", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "S",
        endpoint: "http://s",
        transport: "http",
        createdById: userId,
      },
    });
    const tool = await prisma.mcpTool.create({
      data: { serverId: server.id, orgId, name: "search", riskTier: "low" },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.logInvocation({
      serverId: server.id,
      toolName: "search",
      outcome: "success",
      consentGiven: true,
      inputSummary: "query: test",
    });
    expect(r.toolName).toBe("search");
    expect(r.outcome).toBe("success");
    expect(r.toolId).toBe(tool.id);
  });

  it("handles unknown tool gracefully", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "S",
        endpoint: "http://s",
        transport: "http",
        createdById: userId,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.logInvocation({
      serverId: server.id,
      toolName: "nonexistent",
      outcome: "failure",
    });
    expect(r.toolId).toBeNull();
    expect(r.toolName).toBe("nonexistent");
  });
});

describe("mcp.invocations", () => {
  it("paginates invocations for a server", async () => {
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "S",
        endpoint: "http://s",
        transport: "http",
        createdById: userId,
      },
    });
    for (let i = 0; i < 5; i++) {
      await prisma.mcpToolInvocation.create({
        data: {
          orgId,
          serverId: server.id,
          toolName: `t${i}`,
          actorId: userId,
          outcome: "success",
        },
      });
    }
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.mcp.invocations({ serverId: server.id, limit: 3 });
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBeDefined();
  });
});

describe("mcp snapshots", () => {
  beforeEach(async () => {
    await seedServer();
  });

  it("submitSnapshot accepts a bare tools array and creates the baseline", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const res = await caller.mcp.submitSnapshot({
      serverId,
      toolsJson: JSON.stringify([{ name: "t1", description: "d" }]),
    });
    expect(res.outcome).toBe("baseline_created");
  });

  it("submitSnapshot accepts a full JSON-RPC result envelope", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const res = await caller.mcp.submitSnapshot({
      serverId,
      toolsJson: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "t1" }] },
      }),
    });
    expect(res.outcome).toBe("baseline_created");
  });

  it("submitSnapshot rejects invalid JSON with BAD_REQUEST", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.mcp.submitSnapshot({ serverId, toolsJson: "not json{" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("pendingDiff returns the baseline-vs-latest diff while pending_review", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.mcp.submitSnapshot({
      serverId,
      toolsJson: JSON.stringify([{ name: "a" }]),
    });
    await caller.mcp.submitSnapshot({
      serverId,
      toolsJson: JSON.stringify([{ name: "b" }]),
    });
    const diff = await caller.mcp.pendingDiff({ serverId });
    expect(diff!.added.map((t) => t.name)).toEqual(["b"]);
    expect(diff!.removed.map((t) => t.name)).toEqual(["a"]);
  });

  it("pendingDiff returns null when there is no drift", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.mcp.pendingDiff({ serverId })).toBeNull();
  });

  it("approveBaseline re-baselines, clears driftStatus, writes audit", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.mcp.submitSnapshot({
      serverId,
      toolsJson: JSON.stringify([{ name: "a" }]),
    });
    const drift = await caller.mcp.submitSnapshot({
      serverId,
      toolsJson: JSON.stringify([{ name: "b" }]),
    });
    if (drift.outcome !== "drift_detected") throw new Error("expected drift");
    await caller.mcp.approveBaseline({
      serverId,
      snapshotId: drift.snapshotId,
    });
    const server = await prisma.mcpServer.findUniqueOrThrow({
      where: { id: serverId },
    });
    expect(server.driftStatus).toBe("none");
    expect(server.baselineSnapshotId).toBe(drift.snapshotId);
    const audit = await prisma.auditLog.findFirst({
      where: { orgId, action: "mcp.drift.baselineApproved" },
    });
    expect(audit).not.toBeNull();
  });

  it("approveBaseline rejects a snapshot belonging to a different server", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const otherServer = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Other",
        endpoint: "https://other.example",
        transport: "http",
        createdById: userId,
      },
    });
    const first = await caller.mcp.submitSnapshot({
      serverId: otherServer.id,
      toolsJson: JSON.stringify([{ name: "x" }]),
    });
    if (first.outcome !== "baseline_created")
      throw new Error("expected baseline");
    await expect(
      caller.mcp.approveBaseline({ serverId, snapshotId: first.snapshotId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cross-org: submitSnapshot / approveBaseline / listSnapshots reject another org's server", async () => {
    const otherCaller = appRouter.createCaller(makeCtx(userId, otherOrgId));
    await expect(
      otherCaller.mcp.submitSnapshot({ serverId, toolsJson: "[]" }),
    ).rejects.toThrow();
    await expect(otherCaller.mcp.listSnapshots({ serverId })).resolves.toEqual(
      [],
    );
  });

  it("create with authToken stores ciphertext and never returns it", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const created = await caller.mcp.create({
      name: "s2",
      endpoint: "https://x.example",
      transport: "http",
      authType: "token",
      riskTier: "medium",
      authToken: "sekret",
    });
    expect(JSON.stringify(created)).not.toContain("sekret");
    const row = await prisma.mcpServer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.authTokenEnc).not.toBeNull();
    expect(created.hasAuthToken).toBe(true);
  });
});
