import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";

const TAG = "TXR-RT";

async function cleanup() {
  await prisma.txrReport.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function ctx(orgId: string, userId: string): TRPCContext {
  return {
    session: { userId, orgId, role: "admin", email: `${userId}@x` },
  };
}

describe("transparencyReport router", () => {
  it("creates a report and returns it from get with merged sections and live aggregation", async () => {
    const org = await prisma.organization.create({
      data: { name: TAG + "-" + Date.now() },
    });
    const user = await prisma.user.create({
      data: {
        email: `rt-${Date.now()}@t.local`,
        name: "RT",
        passwordHash: "x",
      },
    });
    const c = appRouter.createCaller(ctx(org.id, user.id));
    await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: TAG + "-active",
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
        lifecycleStage: "production",
      },
    });
    const created = await c.transparencyReport.create({
      title: TAG + " report",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      periodLabel: "2026 H1",
    });
    const got = await c.transparencyReport.get({ id: created.id });
    expect(got.report.id).toBe(created.id);
    expect(got.sections.map((s) => s.key)).toContain("safeguards");
    expect("portfolio" in got.aggregation).toBe(true);
    expect(got.aggregation.generatedAt).toBeTruthy();
  });
});
