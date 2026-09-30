import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import {
  generateReport,
  publishReport,
  listReports,
  getReport,
  IncidentTrendsStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof IncidentTrendsStateError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

export const incidentTrendsRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "incident-trends.read");
    return listReports(ctx.session.orgId);
  }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident-trends.read");
      return getReport(ctx.session.orgId, input.id).catch(translate);
    }),

  generate: orgProcedure
    .input(
      z.object({ windowDays: z.number().int().min(1).max(365).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident-trends.write");
      const res = await generateReport({
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
        windowDays: input.windowDays,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incidentTrends.generate",
        resourceType: "itr_report",
        resourceId: res.reportId,
        after: { windowDays: input.windowDays ?? null },
        ip: ctx.ip,
      });
      return res;
    }),

  publish: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident-trends.write");
      const rec = await publishReport({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incidentTrends.publish",
        resourceType: "itr_report",
        resourceId: rec.id,
        before: { status: "draft" },
        after: { status: "published" },
        ip: ctx.ip,
      });
      return rec;
    }),
});
