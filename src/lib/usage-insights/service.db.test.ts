import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateReport,
  publishReport,
  getReport,
  listReports,
} from "./service";

async function seedOrgUser() {
  const org = await prisma.organization.create({
    data: { name: `usage-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `u-${Math.random()}@x.io`,
      name: "U",
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
  return { org, user, server };
}

async function seedInvocation(
  orgId: string,
  serverId: string,
  actorId: string,
  over: Partial<{
    toolName: string;
    outcome: string;
    consentGiven: boolean;
    inputSummary: string;
  }> = {},
) {
  return prisma.mcpToolInvocation.create({
    data: {
      orgId,
      serverId,
      actorId,
      toolName: over.toolName ?? "search",
      outcome: over.outcome ?? "success",
      consentGiven: over.consentGiven ?? true,
      inputSummary: over.inputSummary ?? "look up a customer record",
    },
  });
}

const NO_LLM = { llmEnabled: () => false };

afterAll(async () => {
  await prisma.$disconnect();
});

describe("generateReport", () => {
  let ctx: Awaited<ReturnType<typeof seedOrgUser>>;
  beforeEach(async () => {
    ctx = await seedOrgUser();
  });

  it("clusters consented invocations into a draft snapshot", async () => {
    for (let i = 0; i < 6; i++)
      await seedInvocation(ctx.org.id, ctx.server.id, ctx.user.id, {
        toolName: "search",
      });
    const { reportId } = await generateReport(
      { orgId: ctx.org.id, userId: ctx.user.id },
      NO_LLM,
    );
    const { report, clusters } = await getReport(ctx.org.id, reportId);
    expect(report.status).toBe("draft");
    expect(report.version).toBe(1);
    expect(report.totalInvocations).toBe(6);
    for (const c of clusters) {
      expect(c).not.toHaveProperty("inputSummary");
      expect(JSON.stringify(c)).not.toContain(ctx.user.id);
    }
  });

  it("excludes non-consented invocations", async () => {
    await seedInvocation(ctx.org.id, ctx.server.id, ctx.user.id, {
      consentGiven: false,
    });
    const { reportId } = await generateReport(
      { orgId: ctx.org.id, userId: ctx.user.id },
      NO_LLM,
    );
    const { report } = await getReport(ctx.org.id, reportId);
    expect(report.totalInvocations).toBe(0);
  });

  it("suppresses clusters below k into the long-tail (k=5)", async () => {
    for (let i = 0; i < 4; i++)
      await seedInvocation(ctx.org.id, ctx.server.id, ctx.user.id, {
        toolName: "search",
      });
    for (let i = 0; i < 5; i++)
      await seedInvocation(ctx.org.id, ctx.server.id, ctx.user.id, {
        toolName: "email",
      });
    const { reportId } = await generateReport(
      { orgId: ctx.org.id, userId: ctx.user.id },
      NO_LLM,
    );
    const { report, clusters } = await getReport(ctx.org.id, reportId);
    const narrated = clusters.filter((c) => !c.isLongTail);
    expect(narrated).toHaveLength(1);
    expect(narrated[0].invocationCount).toBe(5);
    expect(report.suppressedClusterCount).toBe(1);
  });
});

describe("publishReport", () => {
  it("supersedes prior published and computes deltas", async () => {
    const ctx = await seedOrgUser();
    for (let i = 0; i < 5; i++)
      await seedInvocation(ctx.org.id, ctx.server.id, ctx.user.id, {
        toolName: "email",
      });
    const first = await generateReport(
      { orgId: ctx.org.id, userId: ctx.user.id },
      NO_LLM,
    );
    await publishReport({
      orgId: ctx.org.id,
      id: first.reportId,
      userId: ctx.user.id,
    });
    const second = await generateReport(
      { orgId: ctx.org.id, userId: ctx.user.id },
      NO_LLM,
    );
    const pub = await publishReport({
      orgId: ctx.org.id,
      id: second.reportId,
      userId: ctx.user.id,
    });
    expect(pub.status).toBe("published");
    const list = await listReports(ctx.org.id);
    const superseded = list.find((r) => r.id === first.reportId);
    expect(superseded?.status).toBe("superseded");
  });
});
