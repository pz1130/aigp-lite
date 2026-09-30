import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "./log";
import { verifyChain, chainStats } from "./verify";

const AUDIT_ACTIONS = [
  "org.create",
  "usecase.create",
  "usecase.update",
  "usecase.delete",
  "workflow.start",
  "workflow.step.approved",
  "workflow.step.rejected",
  "workflow.step.requested_changes",
  "evidence.upload",
  "runtime.llm.invoke",
  "runtime.llm.blocked",
  "policy.create",
  "policy.update",
  "audit.verify_chain",
] as const;

export const auditRouter = router({
  // List audit logs for the org with optional filters
  list: orgProcedure
    .input(
      z
        .object({
          action: z.enum(AUDIT_ACTIONS).optional(),
          resourceType: z.string().optional(),
          resourceId: z.string().optional(),
          limit: z.number().min(1).max(500).default(100),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "audit.read");
      const where: Record<string, unknown> = {};
      if (input?.action) where.action = input.action;
      if (input?.resourceType) where.resourceType = input.resourceType;
      if (input?.resourceId) where.resourceId = input.resourceId;

      const rows = await ctx.db.auditLog.findMany({
        where,
        orderBy: { ts: "desc" },
        take: (input?.limit ?? 100) + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      return rows;
    }),

  chainStats: orgProcedure.query(({ ctx }) => chainStats(ctx.session.orgId)),

  verifyChain: orgProcedure
    .input(
      z
        .object({
          fromSeq: z.number().int().min(1).optional(),
          toSeq: z.number().int().min(1).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "audit.write");
      const result = await verifyChain({
        orgId: ctx.session.orgId,
        fromSeq: input?.fromSeq,
        toSeq: input?.toSeq,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "audit.verify_chain",
        resourceType: "audit_log",
        after: result.ok
          ? { ok: true, totalChecked: result.totalChecked }
          : {
              ok: false,
              totalChecked: result.totalChecked,
              firstBadSeq: result.firstBadSeq,
              firstBadKind: result.firstBadKind,
            },
        ip: ctx.ip,
      });
      return result;
    }),
});
