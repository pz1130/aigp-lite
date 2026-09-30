import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import {
  startAudit,
  listAudits,
  getAuditWithResults,
  escalateAudit,
  deleteAudit,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof Error && /not found/i.test(err.message))
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  if (
    err instanceof Error &&
    /(already escalated|can be escalated)/i.test(err.message)
  )
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const alignmentAuditRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          usecaseId: z.string().optional(),
          outcome: z.enum(["pass", "concerns", "fail"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "alignment-audit.read");
      return listAudits(ctx.db, {
        usecaseId: input?.usecaseId,
        outcome: input?.outcome,
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "alignment-audit.read");
      const res = await getAuditWithResults(ctx.db, input.id);
      if (!res)
        throw new TRPCError({ code: "NOT_FOUND", message: "audit not found" });
      return res;
    }),

  listProbes: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "alignment-audit.read");
    return ctx.db.alignmentProbe.findMany({
      where: { active: true },
      orderBy: [{ dimension: "asc" }, { sortOrder: "asc" }],
    });
  }),

  start: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        targetProvider: z.enum(["anthropic", "openai", "google"]),
        targetModel: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "alignment-audit.write");
      try {
        return await startAudit(ctx.db, {
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId,
          targetProvider: input.targetProvider,
          targetModel: input.targetModel,
          startedById: ctx.session.userId,
        });
      } catch (err) {
        translate(err);
      }
    }),

  escalate: orgProcedure
    .input(z.object({ auditId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "alignment-audit.write");
      try {
        return await escalateAudit(ctx.db, {
          id: input.auditId,
          orgId: ctx.session.orgId,
          userId: ctx.session.userId,
        });
      } catch (err) {
        translate(err);
      }
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "alignment-audit.delete");
      try {
        await deleteAudit(ctx.db, input.id);
        return { ok: true };
      } catch (err) {
        translate(err);
      }
    }),
});
