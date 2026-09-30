import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { ExternalReportStateError } from "./transitions";
import {
  listReports,
  getReportWithSimilar,
  transitionReport,
  escalateReport,
  setPublicIntake,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof ExternalReportStateError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  if (err instanceof Error && /not found/i.test(err.message))
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  if (
    err instanceof Error &&
    /(already escalated|cannot escalate)/i.test(err.message)
  )
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const externalReportsRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          type: z.enum(["vulnerability", "usage_violation"]).optional(),
          status: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "external-reports.read");
      return listReports(ctx.db, {
        type: input?.type,
        status: input?.status,
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "external-reports.read");
      const res = await getReportWithSimilar(
        ctx.db,
        ctx.session.orgId,
        input.id,
      );
      if (!res)
        throw new TRPCError({ code: "NOT_FOUND", message: "report not found" });
      return res;
    }),

  transition: orgProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum([
          "triaging",
          "accepted",
          "resolved",
          "rejected",
          "duplicate",
        ]),
        triageNotes: z.string().max(8000).optional(),
        citedProhibitedUseClause: z.string().max(8000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "external-reports.write");
      try {
        return await transitionReport(ctx.db, {
          id: input.id,
          orgId: ctx.session.orgId,
          status: input.status,
          userId: ctx.session.userId,
          triageNotes: input.triageNotes,
          citedProhibitedUseClause: input.citedProhibitedUseClause,
        });
      } catch (err) {
        translate(err);
      }
    }),

  escalate: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "external-reports.write");
      try {
        return await escalateReport(ctx.db, {
          id: input.id,
          orgId: ctx.session.orgId,
          userId: ctx.session.userId,
        });
      } catch (err) {
        translate(err);
      }
    }),

  setPublicIntake: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        enabled: z.boolean(),
        rotate: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "external-reports.delete");
      try {
        return await setPublicIntake(ctx.db, {
          usecaseId: input.usecaseId,
          orgId: ctx.session.orgId,
          enabled: input.enabled,
          rotate: input.rotate,
        });
      } catch (err) {
        translate(err);
      }
    }),
});
