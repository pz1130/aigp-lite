import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getCatalog } from "./catalog";
import {
  scoreCategory,
  scoreOverall,
  type AnswerLite,
  type CategoryScore,
} from "./scoring";
import { createInput, saveAnswerInput } from "./answer-schema";
import {
  createAssessment,
  saveAnswer,
  submitAssessment,
  unsubmitAssessment,
  approveAssessment,
  archiveAssessment,
  newVersion,
  FrontierRiskTierStateError,
} from "./service";
import { recheckStaleApproval } from "@/lib/dossier/stale-approval";

function translate(err: unknown): never {
  if (err instanceof FrontierRiskTierStateError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const frontierRiskTierRouter = router({
  catalog: orgProcedure.query(() => getCatalog()),

  list: orgProcedure
    .input(
      z
        .object({ scope: z.enum(["org", "usecase", "all"]).default("all") })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const scope = input?.scope ?? "all";
      const where = {
        orgId: ctx.session.orgId,
        ...(scope === "org" ? { usecaseId: null } : {}),
        ...(scope === "usecase" ? { usecaseId: { not: null } } : {}),
      };
      return ctx.db.frtAssessment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { usecase: { select: { id: true, name: true } } },
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.db.frtAssessment.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          usecase: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          answers: true,
        },
      });
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      const catalog = await getCatalog();
      const byCode = new Map(
        a.answers.map((x) => [
          x.thresholdCode,
          x.status as AnswerLite["status"],
        ]),
      );
      const byCategory: Record<string, CategoryScore> = {};
      for (const c of catalog) {
        const answers: AnswerLite[] = c.thresholds.map((th) => ({
          tier: th.tier,
          status: byCode.get(th.code) ?? "unanswered",
        }));
        byCategory[c.code] = scoreCategory(c.code, answers);
      }
      const overall = scoreOverall(Object.values(byCategory));
      return { assessment: a, catalog, scores: { byCategory, overall } };
    }),

  create: orgProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "frontier-risk-tier.write");
    const rec = await createAssessment({
      orgId: ctx.session.orgId,
      userId: ctx.session.userId,
      usecaseId: input.usecaseId,
      title: input.title,
    }).catch(translate);
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "frontierRiskTier.create",
      resourceType: "frt_assessment",
      resourceId: rec.id,
      after: { usecaseId: input.usecaseId ?? null, title: input.title },
      ip: ctx.ip,
    });
    return rec;
  }),

  saveAnswer: orgProcedure
    .input(saveAnswerInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "frontier-risk-tier.write");
      return saveAnswer({
        orgId: ctx.session.orgId,
        id: input.assessmentId,
        userId: ctx.session.userId,
        thresholdCode: input.thresholdCode,
        status: input.status,
        elaboration: input.elaboration,
        evidenceRefs: input.evidenceRefs,
      }).catch(translate);
    }),

  submit: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "frontier-risk-tier.write");
      const rec = await submitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "frontierRiskTier.submit",
        resourceType: "frt_assessment",
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
      assertPermission(ctx.session.role, "frontier-risk-tier.write");
      const rec = await unsubmitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "frontierRiskTier.unsubmit",
        resourceType: "frt_assessment",
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
      assertPermission(ctx.session.role, "frontier-risk-tier.approve");
      const rec = await approveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "frontierRiskTier.approve",
        resourceType: "frt_assessment",
        resourceId: rec.id,
        before: { status: "submitted" },
        after: { status: "approved" },
        ip: ctx.ip,
      });
      if (rec.usecaseId) {
        await recheckStaleApproval(ctx.db, ctx.session.orgId, rec.usecaseId, {
          triggeredByUserId: ctx.session.userId,
        });
      }
      return rec;
    }),

  archive: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "frontier-risk-tier.approve");
      const rec = await archiveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "frontierRiskTier.archive",
        resourceType: "frt_assessment",
        resourceId: rec.id,
        before: { status: "approved" },
        after: { status: "archived" },
        ip: ctx.ip,
      });
      return rec;
    }),

  newVersion: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "frontier-risk-tier.write");
      const r = await newVersion({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "frontierRiskTier.newVersion",
        resourceType: "frt_assessment",
        resourceId: r.archived.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      if (r.archived.usecaseId) {
        await recheckStaleApproval(
          ctx.db,
          ctx.session.orgId,
          r.archived.usecaseId,
          { triggeredByUserId: ctx.session.userId },
        );
      }
      return r;
    }),
});
