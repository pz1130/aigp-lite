import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import { usageInsightsRouter } from "./router";
import type { TRPCContext } from "@/lib/trpc/server";

const TAG = "UIR-RT";

async function cleanup() {
  await prisma.usageInsightCluster.deleteMany({
    where: { org: { name: { startsWith: TAG } } },
  });
  await prisma.usageInsightReport.deleteMany({
    where: { org: { name: { startsWith: TAG } } },
  });
  await prisma.mcpToolInvocation.deleteMany({
    where: { org: { name: { startsWith: TAG } } },
  });
  await prisma.mcpServer.deleteMany({
    where: { org: { name: { startsWith: TAG } } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function makeCtx(
  orgId: string,
  userId: string,
  role: "admin" | "viewer",
): TRPCContext {
  return {
    session: { userId, orgId, role, email: `${userId}@x` },
  };
}

describe("usageInsightsRouter", () => {
  it("router is exported and has createCaller", () => {
    expect(typeof usageInsightsRouter.createCaller).toBe("function");
  });

  it("generate → list shows a draft; non-writer is denied generate", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `uir-rt-${Date.now()}@t.local`,
        name: "UIR",
        passwordHash: "x",
      },
    });
    const server = await prisma.mcpServer.create({
      data: {
        orgId: org.id,
        name: "srv",
        endpoint: "http://x",
        transport: "http",
        createdById: user.id,
      },
    });

    for (let i = 0; i < 5; i++) {
      await prisma.mcpToolInvocation.create({
        data: {
          orgId: org.id,
          serverId: server.id,
          actorId: user.id,
          toolName: "search",
          outcome: "success",
          consentGiven: true,
          inputSummary: "lookup",
        },
      });
    }

    const writerCtx = makeCtx(org.id, user.id, "admin");
    const viewerCtx = makeCtx(org.id, user.id, "viewer");

    const writerCaller = appRouter.createCaller(writerCtx);
    const viewerCaller = appRouter.createCaller(viewerCtx);

    const { reportId } = await writerCaller.usageInsights.generate({});

    const rows = await writerCaller.usageInsights.list();
    expect(rows.find((r) => r.id === reportId)?.status).toBe("draft");

    await expect(viewerCaller.usageInsights.generate({})).rejects.toThrow(
      /lacks/i,
    );
  });

  it("get returns report+clusters; get with unknown id throws", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-get-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `uir-get-${Date.now()}@t.local`,
        name: "UIR-G",
        passwordHash: "x",
      },
    });
    const server = await prisma.mcpServer.create({
      data: {
        orgId: org.id,
        name: "srv",
        endpoint: "http://x",
        transport: "http",
        createdById: user.id,
      },
    });

    for (let i = 0; i < 5; i++) {
      await prisma.mcpToolInvocation.create({
        data: {
          orgId: org.id,
          serverId: server.id,
          actorId: user.id,
          toolName: "email",
          outcome: "success",
          consentGiven: true,
          inputSummary: "send",
        },
      });
    }

    const caller = appRouter.createCaller(makeCtx(org.id, user.id, "admin"));
    const { reportId } = await caller.usageInsights.generate({});
    const got = await caller.usageInsights.get({ id: reportId });
    expect(got.report.id).toBe(reportId);
    expect(Array.isArray(got.clusters)).toBe(true);

    await expect(
      caller.usageInsights.get({ id: "nonexistent-id" }),
    ).rejects.toThrow(/not found/i);
  });

  it("viewer can list + get but not publish", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-viewer-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `uir-viewer-${Date.now()}@t.local`,
        name: "UIR-V",
        passwordHash: "x",
      },
    });
    const server = await prisma.mcpServer.create({
      data: {
        orgId: org.id,
        name: "srv",
        endpoint: "http://x",
        transport: "http",
        createdById: user.id,
      },
    });

    for (let i = 0; i < 5; i++) {
      await prisma.mcpToolInvocation.create({
        data: {
          orgId: org.id,
          serverId: server.id,
          actorId: user.id,
          toolName: "search",
          outcome: "success",
          consentGiven: true,
          inputSummary: "query",
        },
      });
    }

    const adminCaller = appRouter.createCaller(
      makeCtx(org.id, user.id, "admin"),
    );
    const viewerCaller = appRouter.createCaller(
      makeCtx(org.id, user.id, "viewer"),
    );

    const { reportId } = await adminCaller.usageInsights.generate({});

    const rows = await viewerCaller.usageInsights.list();
    expect(rows.some((r) => r.id === reportId)).toBe(true);

    await expect(
      viewerCaller.usageInsights.publish({ id: reportId }),
    ).rejects.toThrow(/lacks/i);
  });
});
