import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { SECTIONS } from "./sections";
import { resolveAggregation } from "./aggregate";
import { createReportInput, saveSectionInput } from "./input-schema";
import {
  createReport,
  saveSection,
  submitReport,
  unsubmitReport,
  approveReport,
  publishReport,
  newVersion,
  TransparencyReportStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof TransparencyReportStateError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

export const transparencyReportRouter = router({
  list: orgProcedure
    .input(
      z
        .object({ scope: z.enum(["org", "usecase", "all"]).default("all") })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const scope = input?.scope ?? "all";
      return ctx.db.txrReport.findMany({
        where: {
          orgId: ctx.session.orgId,
          ...(scope === "org" ? { usecaseId: null } : {}),
          ...(scope === "usecase" ? { usecaseId: { not: null } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        include: { usecase: { select: { id: true, name: true } } },
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db.txrReport.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          usecase: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          publishedBy: { select: { id: true, name: true, email: true } },
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      const authored = (report.sections as Record<string, string>) ?? {};
      const sections = SECTIONS.map((s) => ({
        key: s.key,
        title: s.title,
        guidance: s.guidance,
        required: s.required,
        text: authored[s.key] ?? "",
      }));
      const aggregation = await resolveAggregation(ctx.db, report);
      return { report, sections, aggregation };
    }),

  create: orgProcedure
    .input(createReportInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.write");
      const rec = await createReport({
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
        usecaseId: input.usecaseId,
        title: input.title,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        periodLabel: input.periodLabel,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "transparencyReport.create",
        resourceType: "txr_report",
        resourceId: rec.id,
        after: {
          usecaseId: input.usecaseId ?? null,
          title: input.title,
          periodLabel: input.periodLabel,
        },
        ip: ctx.ip,
      });
      return rec;
    }),

  saveSection: orgProcedure
    .input(saveSectionInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.write");
      return saveSection({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
        key: input.key,
        text: input.text,
      }).catch(translate);
    }),

  submit: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.write");
      const rec = await submitReport({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "transparencyReport.submit",
        resourceType: "txr_report",
        resourceId: rec.id,
        before: { status: "draft" },
        after: { status: "submitted" },
        ip: ctx.ip,
      });
      return rec;
    }),

  unsubmit: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.write");
      const rec = await unsubmitReport({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "transparencyReport.unsubmit",
        resourceType: "txr_report",
        resourceId: rec.id,
        before: { status: "submitted" },
        after: { status: "draft" },
        ip: ctx.ip,
      });
      return rec;
    }),

  approve: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.approve");
      const rec = await approveReport({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "transparencyReport.approve",
        resourceType: "txr_report",
        resourceId: rec.id,
        before: { status: "submitted" },
        after: { status: "approved" },
        ip: ctx.ip,
      });
      return rec;
    }),

  publish: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.approve");
      const rec = await publishReport({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "transparencyReport.publish",
        resourceType: "txr_report",
        resourceId: rec.id,
        before: { status: "approved" },
        after: { status: "published" },
        ip: ctx.ip,
      });
      return rec;
    }),

  newVersion: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "transparency-report.write");
      const r = await newVersion({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "transparencyReport.newVersion",
        resourceType: "txr_report",
        resourceId: r.superseded.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      return r;
    }),
});
