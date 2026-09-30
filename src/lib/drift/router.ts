import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { isDriftEnabled } from "./config";

export const driftRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.driftBenchmark.findMany({
        where: { orgId: ctx.session.orgId },
        include: {
          _count: { select: { prompts: true, runs: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 50,
      });
    }),

  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.driftBenchmark.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          prompts: { orderBy: { sortOrder: "asc" } },
          runs: { orderBy: { startedAt: "desc" }, take: 10 },
        },
      });
    }),

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        threshold: z.number().min(0).max(10).default(7.0),
        usecaseId: z.string().nullable().optional(),
        prompts: z
          .array(
            z.object({
              promptText: z.string().min(1).max(10000),
              expectedBehavior: z.string().min(1).max(5000),
              referenceOutput: z.string().max(10000).optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "drift.write");
      if (typeof input.usecaseId === "string") {
        const uc = await ctx.db.aiUsecase.findFirst({
          where: { id: input.usecaseId, orgId: ctx.session.orgId },
        });
        if (!uc) throw new Error("Usecase not found");
      }
      const { prompts, ...data } = input;
      const benchmark = await ctx.db.driftBenchmark.create({
        data: {
          ...data,
          orgId: ctx.session.orgId,
          createdById: ctx.session.userId,
          prompts: {
            create: prompts.map((p, i) => ({
              orgId: ctx.session.orgId,
              sortOrder: i,
              promptText: p.promptText,
              expectedBehavior: p.expectedBehavior,
              referenceOutput: p.referenceOutput,
            })),
          },
        },
        include: { prompts: true },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "drift.create",
        resourceType: "drift_benchmark",
        resourceId: benchmark.id,
        after: { name: benchmark.name, promptCount: prompts.length },
      });
      return benchmark;
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        threshold: z.number().min(0).max(10).optional(),
        usecaseId: z.string().nullable().optional(),
        prompts: z
          .array(
            z.object({
              promptText: z.string().min(1).max(10000),
              expectedBehavior: z.string().min(1).max(5000),
              referenceOutput: z.string().max(10000).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "drift.write");
      const { id, prompts, ...data } = input;

      const existing = await ctx.db.driftBenchmark.findFirst({
        where: { id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new Error("Benchmark not found");

      if (typeof input.usecaseId === "string") {
        const uc = await ctx.db.aiUsecase.findFirst({
          where: { id: input.usecaseId, orgId: ctx.session.orgId },
        });
        if (!uc) throw new Error("Usecase not found");
      }

      if (prompts) {
        await ctx.db.driftPrompt.deleteMany({ where: { benchmarkId: id } });
        if (prompts.length > 0) {
          await ctx.db.driftPrompt.createMany({
            data: prompts.map((p, i) => ({
              benchmarkId: id,
              orgId: ctx.session.orgId,
              sortOrder: i,
              promptText: p.promptText,
              expectedBehavior: p.expectedBehavior,
              referenceOutput: p.referenceOutput,
            })),
          });
        }
      }

      const benchmark = await ctx.db.driftBenchmark.update({
        where: { id },
        data,
        include: { prompts: { orderBy: { sortOrder: "asc" } } },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "drift.update",
        resourceType: "drift_benchmark",
        resourceId: id,
        before: { name: existing.name },
        after: { name: benchmark.name },
      });
      return benchmark;
    }),

  remove: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "drift.delete");
      const benchmark = await ctx.db.driftBenchmark.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!benchmark) throw new Error("Benchmark not found");

      await ctx.db.driftBenchmark.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "drift.delete",
        resourceType: "drift_benchmark",
        resourceId: input.id,
        before: { name: benchmark.name },
      });
      return { ok: true };
    }),

  startRun: orgProcedure
    .input(
      z.object({
        benchmarkId: z.string(),
        targetProvider: z.string().min(1),
        targetModel: z.string().min(1),
        judgeModel: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "drift.write");
      if (!isDriftEnabled()) throw new Error("Drift monitoring is not enabled");

      const benchmark = await ctx.db.driftBenchmark.findFirst({
        where: { id: input.benchmarkId, orgId: ctx.session.orgId },
        include: { prompts: true },
      });
      if (!benchmark) throw new Error("Benchmark not found");
      if (benchmark.prompts.length === 0)
        throw new Error("Benchmark has no prompts");

      const run = await ctx.db.driftRun.create({
        data: {
          orgId: ctx.session.orgId,
          benchmarkId: input.benchmarkId,
          targetProvider: input.targetProvider,
          targetModel: input.targetModel,
          judgeModel: input.judgeModel ?? "claude-haiku-4-5-20251001",
          promptCount: benchmark.prompts.length,
        },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "drift.startRun",
        resourceType: "drift_run",
        resourceId: run.id,
        after: {
          benchmarkId: input.benchmarkId,
          targetModel: input.targetModel,
        },
      });

      // Enqueue for the worker (runs inline when REDIS_URL is unset).
      await enqueueJob("drift.run", { runId: run.id });

      return run;
    }),

  runs: orgProcedure
    .input(
      z.object({
        benchmarkId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.driftRun.findMany({
        where: { orgId: ctx.session.orgId, benchmarkId: input.benchmarkId },
        orderBy: { startedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const nextCursor =
        items.length > input.limit ? items.pop()!.id : undefined;
      return { items, nextCursor };
    }),

  runById: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.driftRun.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          results: {
            include: {
              prompt: { select: { promptText: true, expectedBehavior: true } },
            },
            orderBy: { prompt: { sortOrder: "asc" } },
          },
          benchmark: { select: { name: true, threshold: true } },
        },
      });
    }),
});
