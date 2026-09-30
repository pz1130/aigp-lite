import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import { incidentTrendsRouter } from "./router";
import type { TRPCContext } from "@/lib/trpc/server";

const TAG = "ITR-RT";

async function cleanup() {
  await prisma.incidentTrendReport.deleteMany({
    where: { org: { name: { startsWith: TAG } } },
  });
  await prisma.incident.deleteMany({
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

describe("incidentTrendsRouter", () => {
  it("router is exported and has createCaller", () => {
    expect(typeof incidentTrendsRouter.createCaller).toBe("function");
  });

  it("generate → list shows a draft; non-writer is denied generate", async () => {
    // Arrange: seed org + user
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `itr-rt-${Date.now()}@t.local`,
        name: "ITR",
        passwordHash: "x",
      },
    });

    // Seed a couple of incidents so generateReport has data
    for (let i = 0; i < 2; i++) {
      await prisma.incident.create({
        data: {
          orgId: org.id,
          title: `${TAG} incident ${i}`,
          severity: "high",
          status: "open",
          category: "data_leak",
          openedById: user.id,
        },
      });
    }

    const writerCtx = makeCtx(org.id, user.id, "admin");
    const viewerCtx = makeCtx(org.id, user.id, "viewer");

    const writerCaller = appRouter.createCaller(writerCtx);
    const viewerCaller = appRouter.createCaller(viewerCtx);

    // Writer can generate
    const { reportId } = await writerCaller.incidentTrends.generate({});

    // List shows the draft
    const rows = await writerCaller.incidentTrends.list();
    expect(rows.find((r) => r.id === reportId)?.status).toBe("draft");

    // Viewer cannot generate (RBAC denied)
    await expect(viewerCaller.incidentTrends.generate({})).rejects.toThrow(
      /lacks/i,
    );
  });

  it("get returns report+clusters; get with unknown id throws NOT_FOUND", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-get-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `itr-get-${Date.now()}@t.local`,
        name: "ITR-G",
        passwordHash: "x",
      },
    });

    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: `${TAG} inc`,
        severity: "medium",
        status: "open",
        category: "data_leak",
        openedById: user.id,
      },
    });

    const caller = appRouter.createCaller(makeCtx(org.id, user.id, "admin"));
    const { reportId } = await caller.incidentTrends.generate({});
    const got = await caller.incidentTrends.get({ id: reportId });
    expect(got.report.id).toBe(reportId);
    expect(Array.isArray(got.clusters)).toBe(true);

    await expect(
      caller.incidentTrends.get({ id: "nonexistent-id" }),
    ).rejects.toThrow(/not found/i);
  });

  it("viewer can list + get but not publish", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-viewer-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `itr-viewer-${Date.now()}@t.local`,
        name: "ITR-V",
        passwordHash: "x",
      },
    });

    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: `${TAG} inc viewer`,
        severity: "low",
        status: "open",
        category: "data_leak",
        openedById: user.id,
      },
    });

    const adminCaller = appRouter.createCaller(
      makeCtx(org.id, user.id, "admin"),
    );
    const viewerCaller = appRouter.createCaller(
      makeCtx(org.id, user.id, "viewer"),
    );

    const { reportId } = await adminCaller.incidentTrends.generate({});

    // Viewer can read
    const rows = await viewerCaller.incidentTrends.list();
    expect(rows.some((r) => r.id === reportId)).toBe(true);

    // Viewer cannot publish (RBAC denied)
    await expect(
      viewerCaller.incidentTrends.publish({ id: reportId }),
    ).rejects.toThrow(/lacks/i);
  });
});
