import type { Prisma } from "@/lib/prisma";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { computeGovernanceScore } from "./scoring";
import { computePosture } from "./posture";

const SNAPSHOT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export const governanceRouter = router({
  /** Returns the auto-computed governance score (6 dimensions). Writes a snapshot if last one is > 1h old. */
  score: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "maturity.read");

    const result = await computeGovernanceScore(ctx.db, ctx.session.orgId);

    // Debounced snapshot write: skip if last snapshot < 1 hour ago
    const lastSnapshot = await ctx.db.governanceScoreSnapshot.findFirst({
      where: { orgId: ctx.session.orgId },
      orderBy: { ts: "desc" },
      select: { ts: true },
    });

    const shouldWrite =
      !lastSnapshot ||
      Date.now() - lastSnapshot.ts.getTime() > SNAPSHOT_COOLDOWN_MS;
    if (shouldWrite) {
      await ctx.db.governanceScoreSnapshot.create({
        data: {
          orgId: ctx.session.orgId,
          overall: result.overall,
          dimensions: result.dimensions as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return {
      overall: result.overall,
      dimensions: result.dimensions,
      snapshotAt: lastSnapshot?.ts ?? new Date(),
    };
  }),

  /** Returns LLM KPI data for the dashboard: calls, blocked, spend (this week, daily series). */
  kpis: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "maturity.read");

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400_000);

    // Build 7 day boundaries (Mon-Sun or today-6..today)
    const days: { start: Date; end: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      days.push({ start, end });
    }

    const [allInvocations, blockedInvocations] = await Promise.all([
      ctx.db.llmInvocation.findMany({
        where: { orgId: ctx.session.orgId, ts: { gte: weekAgo } },
        select: { ts: true, costUsd: true },
      }),
      ctx.db.llmInvocation.findMany({
        where: {
          orgId: ctx.session.orgId,
          ts: { gte: weekAgo },
          blocked: true,
        },
        select: { ts: true },
      }),
    ]);

    const callsSeries = days.map(
      (d) =>
        allInvocations.filter((inv) => inv.ts >= d.start && inv.ts < d.end)
          .length,
    );
    const blockedSeries = days.map(
      (d) =>
        blockedInvocations.filter((inv) => inv.ts >= d.start && inv.ts < d.end)
          .length,
    );
    const spendSeries = days.map((d) => {
      const dayInvs = allInvocations.filter(
        (inv) => inv.ts >= d.start && inv.ts < d.end,
      );
      return Number(
        dayInvs
          .reduce((sum, inv) => sum + (Number(inv.costUsd) || 0), 0)
          .toFixed(2),
      );
    });

    return {
      calls: { total: allInvocations.length, series: callsSeries },
      blocked: { total: blockedInvocations.length, series: blockedSeries },
      spend: {
        total: Number(
          allInvocations
            .reduce((sum, inv) => sum + (Number(inv.costUsd) || 0), 0)
            .toFixed(2),
        ),
        series: spendSeries,
      },
    };
  }),

  /** Cross-usecase governance posture rollup: 4 dimensions + per-usecase breakdown. */
  posture: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "maturity.read");
    return computePosture(ctx.db, ctx.session.orgId);
  }),
});
