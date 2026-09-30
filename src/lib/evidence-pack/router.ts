import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { enqueueJob } from "@/lib/jobs/enqueue";

export const evidencePackRouter = router({
  generate: orgProcedure
    .input(
      z.object({
        usecaseId: z.string().optional(),
        framework: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "evidence.write");

      const pack = await ctx.db.evidencePack.create({
        data: {
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId ?? null,
          framework: input.framework ?? null,
          status: "pending",
          createdById: ctx.session.userId,
        },
      });

      await enqueueJob("evidencePack.build", { packId: pack.id });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "evidencePack.generate",
        resourceType: "evidence_pack",
        resourceId: pack.id,
        after: { usecaseId: input.usecaseId, framework: input.framework },
        ip: ctx.ip,
      });

      return pack;
    }),

  list: orgProcedure
    .input(
      z.object({
        usecaseId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "evidence.read");

      const where: Record<string, unknown> = { orgId: ctx.session.orgId };
      if (input.usecaseId) where.usecaseId = input.usecaseId;

      return ctx.db.evidencePack.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    }),
});
