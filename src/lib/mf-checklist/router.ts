import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getCatalog } from "./catalog";
import {
  scoreConsideration,
  scoreOverall,
  type AnswerLite,
  type ConsiderationScore,
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
  MfChecklistStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof MfChecklistStateError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const mfChecklistRouter = router({
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
      return ctx.db.mfChecklistAssessment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { usecase: { select: { id: true, name: true } } },
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.db.mfChecklistAssessment.findFirst({
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
        a.answers.map((x) => [x.itemCode, x.status as AnswerLite["status"]]),
      );
      const byConsideration: Record<string, ConsiderationScore> = {};
      for (const s of catalog) {
        for (const c of s.considerations) {
          const answers: AnswerLite[] = c.items.map((it) => ({
            status: byCode.get(it.code) ?? "unanswered",
          }));
          byConsideration[c.code] = scoreConsideration(c.code, answers);
        }
      }
      const overall = scoreOverall(Object.values(byConsideration));
      return { assessment: a, catalog, scores: { byConsideration, overall } };
    }),

  create: orgProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "mindforge-checklist.write");
    const rec = await createAssessment({
      orgId: ctx.session.orgId,
      userId: ctx.session.userId,
      usecaseId: input.usecaseId,
      title: input.title,
    }).catch(translate);
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "mfChecklist.create",
      resourceType: "mf_checklist_assessment",
      resourceId: rec.id,
      after: { usecaseId: input.usecaseId ?? null, title: input.title },
      ip: ctx.ip,
    });
    return rec;
  }),

  saveAnswer: orgProcedure
    .input(saveAnswerInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mindforge-checklist.write");
      return saveAnswer({
        orgId: ctx.session.orgId,
        id: input.assessmentId,
        userId: ctx.session.userId,
        itemCode: input.itemCode,
        status: input.status,
        elaboration: input.elaboration,
        evidenceRefs: input.evidenceRefs,
      }).catch(translate);
    }),

  submit: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mindforge-checklist.write");
      const rec = await submitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mfChecklist.submit",
        resourceType: "mf_checklist_assessment",
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
      assertPermission(ctx.session.role, "mindforge-checklist.write");
      const rec = await unsubmitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mfChecklist.unsubmit",
        resourceType: "mf_checklist_assessment",
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
      assertPermission(ctx.session.role, "mindforge-checklist.approve");
      const rec = await approveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mfChecklist.approve",
        resourceType: "mf_checklist_assessment",
        resourceId: rec.id,
        before: { status: "submitted" },
        after: { status: "approved" },
        ip: ctx.ip,
      });
      return rec;
    }),

  archive: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mindforge-checklist.approve");
      const rec = await archiveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mfChecklist.archive",
        resourceType: "mf_checklist_assessment",
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
      assertPermission(ctx.session.role, "mindforge-checklist.write");
      const r = await newVersion({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mfChecklist.newVersion",
        resourceType: "mf_checklist_assessment",
        resourceId: r.archived.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      return r;
    }),
});
