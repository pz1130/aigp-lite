import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getCatalogWithCrossLinks } from "./catalog";
import {
  scoreSection,
  scoreOverall,
  type AnswerLite,
  type SectionScore,
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
  AsiRedteamChecklistStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof AsiRedteamChecklistStateError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const asiRedteamChecklistRouter = router({
  catalog: orgProcedure.query(() => getCatalogWithCrossLinks()),

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
      return ctx.db.asiChkAssessment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { usecase: { select: { id: true, name: true } } },
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.db.asiChkAssessment.findFirst({
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
      const catalog = await getCatalogWithCrossLinks();
      const byCode = new Map(
        a.answers.map((x) => [x.itemCode, x.status as AnswerLite["status"]]),
      );
      const bySection: Record<string, SectionScore> = {};
      for (const s of catalog) {
        const answers: AnswerLite[] = s.items.map((it) => ({
          status: byCode.get(it.code) ?? "unanswered",
        }));
        bySection[s.key] = scoreSection(s.key, answers);
      }
      const overall = scoreOverall(Object.values(bySection));
      return { assessment: a, catalog, scores: { bySection, overall } };
    }),

  create: orgProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "asi-redteam-checklist.write");
    const rec = await createAssessment({
      orgId: ctx.session.orgId,
      userId: ctx.session.userId,
      usecaseId: input.usecaseId,
      title: input.title,
    }).catch(translate);
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "asiChecklist.create",
      resourceType: "asi_chk_assessment",
      resourceId: rec.id,
      after: { usecaseId: input.usecaseId ?? null, title: input.title },
      ip: ctx.ip,
    });
    return rec;
  }),

  saveAnswer: orgProcedure
    .input(saveAnswerInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "asi-redteam-checklist.write");
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
      assertPermission(ctx.session.role, "asi-redteam-checklist.write");
      const rec = await submitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "asiChecklist.submit",
        resourceType: "asi_chk_assessment",
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
      assertPermission(ctx.session.role, "asi-redteam-checklist.write");
      const rec = await unsubmitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "asiChecklist.unsubmit",
        resourceType: "asi_chk_assessment",
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
      assertPermission(ctx.session.role, "asi-redteam-checklist.approve");
      const rec = await approveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "asiChecklist.approve",
        resourceType: "asi_chk_assessment",
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
      assertPermission(ctx.session.role, "asi-redteam-checklist.approve");
      const rec = await archiveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "asiChecklist.archive",
        resourceType: "asi_chk_assessment",
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
      assertPermission(ctx.session.role, "asi-redteam-checklist.write");
      const r = await newVersion({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "asiChecklist.newVersion",
        resourceType: "asi_chk_assessment",
        resourceId: r.archived.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      return r;
    }),
});
