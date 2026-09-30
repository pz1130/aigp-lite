import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { generatePolicy } from "./orchestrator";
import { isAssistantEnabled, getDailyLimit } from "./config";

export const policyAssistantRouter = router({
  isEnabled: orgProcedure.query(() => ({ enabled: isAssistantEnabled() })),

  usageToday: orgProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = await ctx.db.policyAssistantGeneration.count({
      where: { orgId: ctx.session.orgId, createdAt: { gte: start } },
    });
    return { used, limit: getDailyLimit() };
  }),

  generate: orgProcedure
    .input(z.object({ description: z.string().min(10).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "policy.write");
      if (!isAssistantEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Assistant is disabled",
        });
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const used = await ctx.db.policyAssistantGeneration.count({
        where: { orgId: ctx.session.orgId, createdAt: { gte: start } },
      });
      if (used >= getDailyLimit()) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Daily quota of ${getDailyLimit()} reached`,
        });
      }
      const r = await generatePolicy({
        description: input.description,
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "policy_assistant.generate",
        resourceType: "policy_assistant_generation",
        resourceId: r.generationId,
        after: { status: r.status, retryCount: r.retryCount },
        ip: ctx.ip,
      });
      return r.output;
    }),
});
