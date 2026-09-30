import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { PILLARS, QUESTIONS, maxScoreForPillar } from "./pillars";

export const maturityRouter = router({
  questions: orgProcedure.query(({ ctx }) => {
    assertPermission(ctx.session.role, "maturity.read");
    return { pillars: PILLARS, questions: QUESTIONS };
  }),

  latest: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "maturity.read");
    const out: Record<
      string,
      { scoreInt: number; maxScore: number; ts: Date } | null
    > = {};
    for (const p of PILLARS) {
      const r = await ctx.db.governanceMaturityAssessment.findFirst({
        where: { pillar: p },
        orderBy: { ts: "desc" },
      });
      out[p] = r
        ? { scoreInt: r.scoreInt, maxScore: r.maxScore, ts: r.ts }
        : null;
    }
    return out;
  }),

  submit: orgProcedure
    .input(
      z.object({
        scoresByPillar: z.record(
          z.string(),
          z.array(
            z.object({
              qid: z.string(),
              score: z.number().int().min(0).max(3),
            }),
          ),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "maturity.write");
      const created: { pillar: string; scoreInt: number }[] = [];
      for (const p of PILLARS) {
        const items = input.scoresByPillar[p] ?? [];
        const scoreInt = items.reduce((acc, x) => acc + x.score, 0);
        const row = await ctx.db.governanceMaturityAssessment.create({
          data: {
            orgId: ctx.session.orgId,
            pillar: p,
            scoreInt,
            maxScore: maxScoreForPillar(p),
            details: items,
            byUserId: ctx.session.userId,
          },
        });
        created.push({ pillar: p, scoreInt: row.scoreInt });
      }
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "maturity.submit",
        resourceType: "governance_maturity_assessment",
        after: created,
      });
      return { ok: true as const, created };
    }),

  dashboardSummary: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "maturity.read");
    const results: Record<string, { scoreInt: number; maxScore: number }> = {};
    for (const p of PILLARS) {
      const r = await ctx.db.governanceMaturityAssessment.findFirst({
        where: { pillar: p },
        orderBy: { ts: "desc" },
      });
      results[p] = r
        ? { scoreInt: r.scoreInt, maxScore: r.maxScore }
        : { scoreInt: 0, maxScore: maxScoreForPillar(p) };
    }
    return results;
  }),
});
