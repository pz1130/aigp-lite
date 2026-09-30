import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { usecaseEvents } from "@/lib/events/bus";
import { workflowEvents } from "@/lib/events/workflow-bus";
import { recheckStaleApproval } from "@/lib/dossier/stale-approval";
import { runAnalysis } from "./analyze";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@/lib/prisma";

const usecaseCreate = z.object({
  name: z.string().min(1).max(120),
  autonomyLevel: z.enum([
    "assistant",
    "simple_agent",
    "collaborative_agent",
    "agent_ecosystem",
  ]),
  deploymentType: z.enum(["built", "blended", "embedded", "byo"]),
  description: z.string().max(2000).default(""),
  modelCardMd: z.string().max(50000).default(""),
  intendedUseMd: z.string().max(2000).default(""),
  prohibitedUseMd: z.string().max(2000).default(""),
});

const usecaseUpdate = usecaseCreate.partial().extend({
  id: z.string(),
  lifecycleStage: z
    .enum(["proposed", "development", "production", "retired"])
    .optional(),
});

const modelVersionCreate = z.object({
  usecaseId: z.string(),
  version: z.string().min(1).max(80),
  modelCardMd: z.string().max(50000).default(""),
  deployedAt: z.string().datetime().optional().nullable(),
});

const modelVersionUpdate = modelVersionCreate.partial().extend({
  id: z.string(),
});

export const inventoryRouter = router({
  list: orgProcedure.query(({ ctx }) =>
    ctx.db.aiUsecase.findMany({ orderBy: { createdAt: "desc" } }),
  ),

  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const u = await ctx.db.aiUsecase.findUnique({ where: { id: input.id } });
      if (!u) throw new TRPCError({ code: "NOT_FOUND" });
      return u;
    }),

  create: orgProcedure.input(usecaseCreate).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "inventory.write");
    // withOrg() injects orgId; Prisma's static type still demands it.
    const created = await ctx.db.aiUsecase.create({
      data: {
        ...input,
        orgId: ctx.session.orgId,
        ownerId: ctx.session.userId,
      } satisfies Prisma.AiUsecaseUncheckedCreateInput,
    });
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "usecase.create",
      resourceType: "ai_usecase",
      resourceId: created.id,
      after: { name: created.name, autonomyLevel: created.autonomyLevel },
      ip: ctx.ip,
    });
    usecaseEvents.emitCreated({
      orgId: ctx.session.orgId,
      usecaseId: created.id,
      byUserId: ctx.session.userId,
    });
    return created;
  }),

  update: orgProcedure.input(usecaseUpdate).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "inventory.write");
    const before = await ctx.db.aiUsecase.findUnique({
      where: { id: input.id },
    });
    if (!before) throw new TRPCError({ code: "NOT_FOUND" });
    const { id, ...rest } = input;
    // Reinstating a deprecated system to an active stage clears the deprecation
    // metadata; deprecated -> retired keeps it as history.
    const data: Prisma.AiUsecaseUncheckedUpdateInput = { ...rest };
    if (
      before.lifecycleStage === "deprecated" &&
      rest.lifecycleStage &&
      rest.lifecycleStage !== "retired"
    ) {
      data.sunsetDate = null;
      data.deprecatedAt = null;
      data.deprecatedById = null;
      data.deprecationReason = "";
    }
    const after = await ctx.db.aiUsecase.update({
      where: { id },
      data,
    });
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "usecase.update",
      resourceType: "ai_usecase",
      resourceId: id,
      before,
      after,
      ip: ctx.ip,
    });
    // intendedUseMd/prohibitedUseMd intentionally excluded: they aren't
    // consumed by the analysis prompt (see analyze/prompt.ts), so editing
    // them shouldn't trigger a redundant LLM re-classification.
    const contentChanged =
      (input.description !== undefined &&
        input.description !== before.description) ||
      (input.modelCardMd !== undefined &&
        input.modelCardMd !== before.modelCardMd);
    if (contentChanged) {
      usecaseEvents.emitUpdated({
        orgId: ctx.session.orgId,
        usecaseId: id,
        byUserId: ctx.session.userId,
      });
    }
    return after;
  }),

  deprecate: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        sunsetDate: z.string().datetime().optional().nullable(),
        reason: z.string().max(2000).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.write");
      const before = await ctx.db.aiUsecase.findFirst({
        where: { id: input.usecaseId },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        before.lifecycleStage === "deprecated" ||
        before.lifecycleStage === "retired"
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "invalid_deprecation_transition",
        });
      }
      const sunset = input.sunsetDate ? new Date(input.sunsetDate) : null;
      const after = await ctx.db.aiUsecase.update({
        where: { id: input.usecaseId },
        data: {
          lifecycleStage: "deprecated",
          deprecatedAt: new Date(),
          deprecatedById: ctx.session.userId,
          sunsetDate: sunset,
          deprecationReason: input.reason,
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "usecase.deprecated",
        resourceType: "ai_usecase",
        resourceId: input.usecaseId,
        before,
        after,
        ip: ctx.ip,
      });
      workflowEvents.emitUsecaseDeprecated({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
        sunsetDate: sunset ? sunset.toISOString() : null,
        deprecatedByUserId: ctx.session.userId,
      });
      return after;
    }),

  remove: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.delete");
      const before = await ctx.db.aiUsecase.findUnique({
        where: { id: input.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.aiUsecase.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "usecase.delete",
        resourceType: "ai_usecase",
        resourceId: input.id,
        before,
        ip: ctx.ip,
      });
      return { ok: true as const };
    }),

  // ── Model Versions ──────────────────────────────────────────────────────────

  modelVersionList: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) =>
      ctx.db.aiModelVersion.findMany({
        where: { usecaseId: input.usecaseId },
        orderBy: { createdAt: "desc" },
      }),
    ),

  modelVersionCreate: orgProcedure
    .input(modelVersionCreate)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.write");
      const parent = await ctx.db.aiUsecase.findFirst({
        where: { id: input.usecaseId },
        select: { lifecycleStage: true },
      });
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });
      if (parent.lifecycleStage === "deprecated") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "system_deprecated",
        });
      }
      const created = await ctx.db.aiModelVersion.create({ data: input });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "model_version.create",
        resourceType: "ai_model_version",
        resourceId: created.id,
        after: { usecaseId: created.usecaseId, version: created.version },
        ip: ctx.ip,
      });
      await recheckStaleApproval(ctx.db, ctx.session.orgId, input.usecaseId, {
        triggeredByUserId: ctx.session.userId,
      });
      return created;
    }),

  modelVersionUpdate: orgProcedure
    .input(modelVersionUpdate)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.write");
      const { id, ...rest } = input;
      const before = await ctx.db.aiModelVersion.findUnique({ where: { id } });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const after = await ctx.db.aiModelVersion.update({
        where: { id },
        data: rest,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "model_version.update",
        resourceType: "ai_model_version",
        resourceId: id,
        before,
        after,
        ip: ctx.ip,
      });
      await recheckStaleApproval(ctx.db, ctx.session.orgId, before.usecaseId, {
        triggeredByUserId: ctx.session.userId,
      });
      return after;
    }),

  // ── Classification (LLM-assisted analysis) ──────────────────────────────────

  classification: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) =>
      ctx.db.usecaseClassification.findUnique({
        where: { usecaseId: input.usecaseId },
      }),
    ),

  analyze: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.write");
      const u = await ctx.db.aiUsecase.findUnique({
        where: { id: input.usecaseId },
      });
      if (!u) throw new TRPCError({ code: "NOT_FOUND" });
      await runAnalysis({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
        reason: "manual",
        actorId: ctx.session.userId,
      });
      return { ok: true as const, queued: true as const };
    }),

  analyzeUnanalyzed: orgProcedure.mutation(async ({ ctx }) => {
    assertPermission(ctx.session.role, "inventory.write");
    const rows = await ctx.db.aiUsecase.findMany({
      where: { classification: null },
      select: { id: true },
    });
    const errors: string[] = [];
    for (const row of rows) {
      try {
        await runAnalysis({
          orgId: ctx.session.orgId,
          usecaseId: row.id,
          reason: "manual",
          actorId: ctx.session.userId,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (errors.length > 0) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `${errors.length}/${rows.length} analyses failed: ${errors[0]}`,
      });
    }
    return { ok: true as const, queued: rows.length };
  }),

  unanalyzedCount: orgProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.aiUsecase.count({
      where: { classification: null },
    });
    return { count };
  }),
});
