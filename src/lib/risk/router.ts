import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { TRPCError } from "@trpc/server";
import { scoreUsecase } from "./scoring";
import { renderAssessmentPdf, type AssessmentReportData } from "./report";
import { store } from "@/lib/storage";

const frameworkCreate = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      "code must be alphanumeric with dots, dashes, underscores",
    ),
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(20),
  description: z.string().max(2000).default(""),
});

const frameworkUpdate = frameworkCreate.partial().extend({ id: z.string() });

const controlCreate = z.object({
  frameworkId: z.string(),
  code: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
});

const controlUpdate = controlCreate.partial().extend({ id: z.string() });

export const riskRouter = router({
  frameworks: orgProcedure.query(({ ctx }) =>
    ctx.db.riskFramework.findMany({
      include: { controls: true },
      orderBy: { code: "asc" },
    }),
  ),

  controlStatuses: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.usecaseControlStatus.findMany({
        where: { usecaseId: input.usecaseId },
        include: { control: { include: { framework: true } } },
      }),
    ),

  setControlStatus: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        controlId: z.string(),
        status: z.enum([
          "not_applicable",
          "not_started",
          "in_progress",
          "satisfied",
          "failed",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const before = await ctx.db.usecaseControlStatus.findUnique({
        where: {
          usecaseId_controlId: {
            usecaseId: input.usecaseId,
            controlId: input.controlId,
          },
        },
      });
      const after = await ctx.db.usecaseControlStatus.upsert({
        where: {
          usecaseId_controlId: {
            usecaseId: input.usecaseId,
            controlId: input.controlId,
          },
        },
        create: { ...input, orgId: ctx.session.orgId },
        update: { status: input.status },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.control.set",
        resourceType: "usecase_control_status",
        resourceId: `${input.usecaseId}:${input.controlId}`,
        before,
        after,
      });
      return after;
    }),

  assess: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        notes: z.string().max(2000).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const u = await ctx.db.aiUsecase.findUnique({
        where: { id: input.usecaseId },
      });
      if (!u) throw new TRPCError({ code: "NOT_FOUND" });
      const statuses = await ctx.db.usecaseControlStatus.findMany({
        where: { usecaseId: input.usecaseId },
        include: { control: { include: { framework: true } } },
      });
      const result = scoreUsecase(
        u.autonomyLevel as
          | "assistant"
          | "simple_agent"
          | "collaborative_agent"
          | "agent_ecosystem",
        statuses.map((s) => ({
          id: s.controlId,
          status: s.status as
            | "not_applicable"
            | "not_started"
            | "in_progress"
            | "satisfied"
            | "failed",
          severity: s.control.severity as "low" | "medium" | "high",
          name: s.control.title,
          description: s.control.description,
        })),
      );
      const created = await ctx.db.usecaseRiskAssessment.create({
        data: {
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId,
          scoreInt: result.scoreInt,
          level: result.level as "low" | "medium" | "high",
          notes: input.notes,
          assessedById: ctx.session.userId,
        },
      });

      // Generate PDF report
      try {
        const user = await ctx.db.user.findUniqueOrThrow({
          where: { id: ctx.session.userId },
        });
        const fwByControl = new Map<string, { code: string; name: string }>();
        for (const s of statuses) {
          if (s.control.framework) {
            fwByControl.set(s.controlId, {
              code: s.control.framework.code,
              name: s.control.framework.name,
            });
          }
        }
        const reportData: AssessmentReportData = {
          orgName:
            (
              await ctx.db.organization.findUnique({
                where: { id: ctx.session.orgId },
              })
            )?.name ?? "",
          usecaseName: u.name,
          autonomyLevel: u.autonomyLevel,
          scoreInt: result.scoreInt,
          level: result.level,
          notes: input.notes,
          assessedAt: created.assessedAt,
          assessedByName: user.name ?? user.email,
          controls: statuses.map((s) => ({
            code: s.control.code,
            framework: fwByControl.get(s.controlId)?.code ?? "",
            title: s.control.title,
            severity: s.control.severity,
            status: s.status,
          })),
          catalogRisks: (
            await ctx.db.usecaseCatalogRiskLink.findMany({
              where: { usecaseId: input.usecaseId },
              include: { risk: true },
            })
          ).map((l) => ({
            source: l.risk.source,
            code: l.risk.code,
            title: l.risk.title,
            severity: l.severity,
            rationale: l.rationale,
          })),
        };
        const pdfBuf = await renderAssessmentPdf(reportData);
        const { path } = await store(
          `${ctx.session.orgId}/assessments/${created.id}`,
          {
            buffer: pdfBuf,
            filename: `risk-assessment-${created.id}.pdf`,
            mimeType: "application/pdf",
          },
        );
        await ctx.db.usecaseRiskAssessment.update({
          where: { id: created.id },
          data: { pdfFileKey: path },
        });
        created.pdfFileKey = path;
      } catch (err) {
        // PDF failure must not block the assessment row; surface for ops.
        console.error("[risk.assess] PDF generation failed", {
          assessmentId: created.id,
          err,
        });
      }

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.assess",
        resourceType: "usecase_risk_assessment",
        resourceId: created.id,
        after: { score: result.scoreInt, level: result.level },
      });
      return created;
    }),

  latestAssessment: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.usecaseRiskAssessment.findFirst({
        where: { usecaseId: input.usecaseId },
        orderBy: { assessedAt: "desc" },
      }),
    ),

  highRiskCount: orgProcedure.query(async ({ ctx }) => {
    const assessments = await ctx.db.usecaseRiskAssessment.findMany({
      where: { orgId: ctx.session.orgId },
      include: {
        usecase: {
          include: {
            controlStatuses: { include: { control: true } },
          },
        },
      },
    });
    let count = 0;
    for (const a of assessments) {
      const statuses = a.usecase?.controlStatuses ?? [];
      const { scoreUsecase } = await import("@/lib/risk/scoring");
      if (
        scoreUsecase(
          a.usecase.autonomyLevel,
          statuses.map((s) => ({
            id: s.controlId,
            status: s.status,
            severity: s.control.severity,
            name: s.control.title,
            description: s.control.description,
          })),
        ).level === "high"
      )
        count++;
    }
    return count;
  }),

  // ── Framework CRUD ──────────────────────────────────────────────────

  frameworkCreate: orgProcedure
    .input(frameworkCreate)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const existing = await ctx.db.riskFramework.findUnique({
        where: { code: input.code },
      });
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: `framework code "${input.code}" already exists`,
        });
      const created = await ctx.db.riskFramework.create({ data: input });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.framework.create",
        resourceType: "risk_framework",
        resourceId: created.id,
        after: {
          code: created.code,
          name: created.name,
          version: created.version,
        },
      });
      return created;
    }),

  frameworkUpdate: orgProcedure
    .input(frameworkUpdate)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const before = await ctx.db.riskFramework.findUnique({
        where: { id: input.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.code && input.code !== before.code) {
        const clash = await ctx.db.riskFramework.findUnique({
          where: { code: input.code },
        });
        if (clash)
          throw new TRPCError({
            code: "CONFLICT",
            message: `framework code "${input.code}" already exists`,
          });
      }
      const { id, ...rest } = input;
      const after = await ctx.db.riskFramework.update({
        where: { id },
        data: rest,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.framework.update",
        resourceType: "risk_framework",
        resourceId: id,
        before,
        after,
      });
      return after;
    }),

  frameworkDelete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.delete");
      const before = await ctx.db.riskFramework.findUnique({
        where: { id: input.id },
        include: { controls: true },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.riskFramework.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.framework.delete",
        resourceType: "risk_framework",
        resourceId: input.id,
        before: {
          code: before.code,
          name: before.name,
          controlCount: before.controls.length,
        },
      });
      return { ok: true as const };
    }),

  // ── Control CRUD ────────────────────────────────────────────────────

  controlCreate: orgProcedure
    .input(controlCreate)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const fw = await ctx.db.riskFramework.findUnique({
        where: { id: input.frameworkId },
      });
      if (!fw)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "framework not found",
        });
      const clash = await ctx.db.riskControl.findUnique({
        where: {
          frameworkId_code: {
            frameworkId: input.frameworkId,
            code: input.code,
          },
        },
      });
      if (clash)
        throw new TRPCError({
          code: "CONFLICT",
          message: `control code "${input.code}" already exists in this framework`,
        });
      const created = await ctx.db.riskControl.create({ data: input });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.control.create",
        resourceType: "risk_control",
        resourceId: created.id,
        after: {
          frameworkId: created.frameworkId,
          code: created.code,
          title: created.title,
          severity: created.severity,
        },
      });
      return created;
    }),

  controlUpdate: orgProcedure
    .input(controlUpdate)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const before = await ctx.db.riskControl.findUnique({
        where: { id: input.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.code && input.code !== before.code) {
        const clash = await ctx.db.riskControl.findUnique({
          where: {
            frameworkId_code: {
              frameworkId: before.frameworkId,
              code: input.code,
            },
          },
        });
        if (clash)
          throw new TRPCError({
            code: "CONFLICT",
            message: `control code "${input.code}" already exists in this framework`,
          });
      }
      const { id, ...rest } = input;
      const after = await ctx.db.riskControl.update({
        where: { id },
        data: rest,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.control.update",
        resourceType: "risk_control",
        resourceId: id,
        before,
        after,
      });
      return after;
    }),

  controlDelete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.delete");
      const before = await ctx.db.riskControl.findUnique({
        where: { id: input.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const statusCount = await ctx.db.usecaseControlStatus.count({
        where: { controlId: input.id },
      });
      if (statusCount > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "control has existing use case statuses and cannot be deleted",
        });
      }
      await ctx.db.riskControl.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.control.delete",
        resourceType: "risk_control",
        resourceId: input.id,
        before: {
          code: before.code,
          title: before.title,
          frameworkId: before.frameworkId,
        },
      });
      return { ok: true as const };
    }),

  controlBatchCreate: orgProcedure
    .input(
      z.object({
        frameworkId: z.string(),
        controls: z
          .array(
            z.object({
              code: z.string().min(1).max(50),
              title: z.string().min(1).max(200),
              description: z.string().max(5000).default(""),
              severity: z.enum(["low", "medium", "high"]).default("medium"),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const fw = await ctx.db.riskFramework.findUnique({
        where: { id: input.frameworkId },
      });
      if (!fw)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "framework not found",
        });

      // Check for duplicate codes within the batch
      const seen = new Set<string>();
      for (const c of input.controls) {
        if (seen.has(c.code))
          throw new TRPCError({
            code: "CONFLICT",
            message: `duplicate code "${c.code}" in import batch`,
          });
        seen.add(c.code);
      }

      // Check for conflicts with existing controls
      const existing = await ctx.db.riskControl.findMany({
        where: { frameworkId: input.frameworkId, code: { in: [...seen] } },
        select: { code: true },
      });
      if (existing.length > 0) {
        const codes = existing.map((e) => e.code).join(", ");
        throw new TRPCError({
          code: "CONFLICT",
          message: `codes already exist: ${codes}`,
        });
      }

      const created = await ctx.db.riskControl.createMany({
        data: input.controls.map((c) => ({
          ...c,
          frameworkId: input.frameworkId,
        })),
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.control.batchCreate",
        resourceType: "risk_control",
        resourceId: input.frameworkId,
        after: { count: created.count, frameworkId: input.frameworkId },
      });

      return { count: created.count };
    }),

  regeneratePdf: orgProcedure
    .input(z.object({ assessmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");

      const assessment = await ctx.db.usecaseRiskAssessment.findFirst({
        where: { id: input.assessmentId, orgId: ctx.session.orgId },
      });
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

      const usecase = await ctx.db.aiUsecase.findUniqueOrThrow({
        where: { id: assessment.usecaseId },
      });
      const statuses = await ctx.db.usecaseControlStatus.findMany({
        where: { usecaseId: assessment.usecaseId },
        include: { control: { include: { framework: true } } },
      });
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: assessment.assessedById },
      });
      const org = await ctx.db.organization.findUnique({
        where: { id: ctx.session.orgId },
      });

      const reportData: AssessmentReportData = {
        orgName: org?.name ?? "",
        usecaseName: usecase.name,
        autonomyLevel: usecase.autonomyLevel,
        scoreInt: assessment.scoreInt,
        level: assessment.level,
        notes: assessment.notes,
        assessedAt: assessment.assessedAt,
        assessedByName: user.name ?? user.email,
        controls: statuses.map((s) => ({
          code: s.control.code,
          framework: s.control.framework?.code ?? "",
          title: s.control.title,
          severity: s.control.severity,
          status: s.status,
        })),
        catalogRisks: (
          await ctx.db.usecaseCatalogRiskLink.findMany({
            where: { usecaseId: assessment.usecaseId },
            include: { risk: true },
          })
        ).map((l) => ({
          source: l.risk.source,
          code: l.risk.code,
          title: l.risk.title,
          severity: l.severity,
          rationale: l.rationale,
        })),
        generatedAt: new Date(),
      };

      const pdfBuf = await renderAssessmentPdf(reportData);
      const { path } = await store(
        `${ctx.session.orgId}/assessments/${assessment.id}`,
        {
          buffer: pdfBuf,
          filename: `risk-assessment-${assessment.id}.pdf`,
          mimeType: "application/pdf",
        },
      );
      await ctx.db.usecaseRiskAssessment.update({
        where: { id: assessment.id },
        data: { pdfFileKey: path },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk.assessment.pdf_regenerate",
        resourceType: "usecase_risk_assessment",
        resourceId: assessment.id,
        after: { pdfFileKey: path },
        ip: ctx.ip,
      });

      return { assessmentId: assessment.id, pdfFileKey: path };
    }),
});
