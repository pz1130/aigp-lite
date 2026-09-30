import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { listTemplates, getTemplate } from "./registry";
import { aggregate } from "./aggregator";
import { renderPdf } from "./renderers/pdf";
import { renderXlsx } from "./renderers/xlsx";
import { saveReportFile } from "./storage";

export const reportsRouter = router({
  templates: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "reports.read");
    return listTemplates().map((t) => ({
      id: t.id,
      displayKey: t.displayKey,
      version: t.version,
      controlCount: t.controls.length,
    }));
  }),

  list: orgProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "reports.read");
      const items = await ctx.db.report.findMany({
        where: { orgId: ctx.session.orgId },
        orderBy: { generatedAt: "desc" },
        take: input.limit,
      });
      return { items };
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "reports.read");
      const row = await ctx.db.report.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  generate: orgProcedure
    .input(
      z.object({
        templateId: z.enum([
          "nist-ai-rmf",
          "iso-27001",
          "soc2-type2",
          "iso-42001",
          "eu-ai-act",
          "mindforge",
        ]),
        periodStart: z.coerce.date(),
        periodEnd: z.coerce.date(),
        formats: z
          .array(z.enum(["pdf", "xlsx"]))
          .min(1)
          .default(["pdf", "xlsx"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "reports.write");
      const template = getTemplate(input.templateId);
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: ctx.session.userId },
      });

      const data = await aggregate({
        orgId: ctx.session.orgId,
        period: { start: input.periodStart, end: input.periodEnd },
        template,
        generatedBy: { id: user.id, name: user.name ?? user.email },
      });

      // Create row first (so we have an id for the storage path)
      const row = await ctx.db.report.create({
        data: {
          orgId: ctx.session.orgId,
          templateId: input.templateId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          generatedBy: ctx.session.userId,
        },
      });

      const update: Record<string, string> = {};
      if (input.formats.includes("pdf")) {
        const pdf = await renderPdf(data);
        update.pdfFileKey = await saveReportFile(
          ctx.session.orgId,
          row.id,
          input.templateId,
          "pdf",
          pdf,
        );
      }
      if (input.formats.includes("xlsx")) {
        const xlsx = await renderXlsx(data);
        update.excelFileKey = await saveReportFile(
          ctx.session.orgId,
          row.id,
          input.templateId,
          "xlsx",
          xlsx,
        );
      }

      const final = await ctx.db.report.update({
        where: { id: row.id },
        data: update,
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "report.generate",
        resourceType: "report",
        resourceId: final.id,
        after: {
          templateId: input.templateId,
          formats: input.formats,
          controlCount: template.controls.length,
        },
      });

      return final;
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "reports.delete");
      const row = await ctx.db.report.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.report.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "report.delete",
        resourceType: "report",
        resourceId: row.id,
        before: {
          templateId: row.templateId,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
        },
      });
      return { ok: true };
    }),
});
