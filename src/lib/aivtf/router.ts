import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getCatalog } from "./catalog";
import { scorePrinciple, scoreOverall, type AnswerLite } from "./scoring";
import { createInput, saveAnswerInput } from "./answer-schema";
import {
  createAssessment,
  saveAnswer,
  submitAssessment,
  unsubmitAssessment,
  approveAssessment,
  archiveAssessment,
  newVersion,
  AivtfStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof AivtfStateError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const aivtfRouter = router({
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
      return ctx.db.aivtfAssessment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { usecase: { select: { id: true, name: true } } },
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.db.aivtfAssessment.findFirst({
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
        a.answers.map((x) => [x.processCode, x.status as AnswerLite["status"]]),
      );
      const principleScores = catalog.map((p) => {
        const answers: AnswerLite[] = p.outcomes
          .flatMap((o) => o.processes)
          .map((pr) => ({ status: byCode.get(pr.code) ?? "unanswered" }));
        return scorePrinciple(p.num, answers);
      });
      return {
        assessment: a,
        catalog,
        scores: {
          byPrinciple: principleScores,
          overall: scoreOverall(principleScores),
        },
      };
    }),

  create: orgProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "aivtf.write");
    const rec = await createAssessment({
      orgId: ctx.session.orgId,
      userId: ctx.session.userId,
      usecaseId: input.usecaseId,
      title: input.title,
    }).catch(translate);
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "aivtf.create",
      resourceType: "aivtf_assessment",
      resourceId: rec.id,
      after: { usecaseId: input.usecaseId ?? null, title: input.title },
      ip: ctx.ip,
    });
    return rec;
  }),

  saveAnswer: orgProcedure
    .input(saveAnswerInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "aivtf.write");
      return saveAnswer({
        orgId: ctx.session.orgId,
        id: input.assessmentId,
        userId: ctx.session.userId,
        processCode: input.processCode,
        status: input.status,
        elaboration: input.elaboration,
        evidenceRefs: input.evidenceRefs,
      }).catch(translate);
    }),

  submit: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "aivtf.write");
      const rec = await submitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "aivtf.submit",
        resourceType: "aivtf_assessment",
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
      assertPermission(ctx.session.role, "aivtf.write");
      const rec = await unsubmitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "aivtf.unsubmit",
        resourceType: "aivtf_assessment",
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
      assertPermission(ctx.session.role, "aivtf.approve");
      const rec = await approveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "aivtf.approve",
        resourceType: "aivtf_assessment",
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
      assertPermission(ctx.session.role, "aivtf.approve");
      const rec = await archiveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "aivtf.archive",
        resourceType: "aivtf_assessment",
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
      assertPermission(ctx.session.role, "aivtf.write");
      const r = await newVersion({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "aivtf.newVersion",
        resourceType: "aivtf_assessment",
        resourceId: r.archived.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      return r;
    }),
});
