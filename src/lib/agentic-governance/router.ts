import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getCatalogWithSeeAlso } from "./catalog";
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
  AgenticGovChecklistStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof AgenticGovChecklistStateError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

export const agenticGovernanceRouter = router({
  catalog: orgProcedure.query(() => getCatalogWithSeeAlso()),

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
      return ctx.db.agChkAssessment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { usecase: { select: { id: true, name: true } } },
      });
    }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.db.agChkAssessment.findFirst({
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
      const catalog = await getCatalogWithSeeAlso();
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
    assertPermission(ctx.session.role, "agentic-governance.write");
    const rec = await createAssessment({
      orgId: ctx.session.orgId,
      userId: ctx.session.userId,
      usecaseId: input.usecaseId,
      title: input.title,
    }).catch(translate);
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "agenticGov.create",
      resourceType: "ag_chk_assessment",
      resourceId: rec.id,
      after: { usecaseId: input.usecaseId ?? null, title: input.title },
      ip: ctx.ip,
    });
    return rec;
  }),

  saveAnswer: orgProcedure
    .input(saveAnswerInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "agentic-governance.write");
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
      assertPermission(ctx.session.role, "agentic-governance.write");
      const rec = await submitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "agenticGov.submit",
        resourceType: "ag_chk_assessment",
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
      assertPermission(ctx.session.role, "agentic-governance.write");
      const rec = await unsubmitAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "agenticGov.unsubmit",
        resourceType: "ag_chk_assessment",
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
      assertPermission(ctx.session.role, "agentic-governance.approve");
      const rec = await approveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "agenticGov.approve",
        resourceType: "ag_chk_assessment",
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
      assertPermission(ctx.session.role, "agentic-governance.approve");
      const rec = await archiveAssessment({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "agenticGov.archive",
        resourceType: "ag_chk_assessment",
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
      assertPermission(ctx.session.role, "agentic-governance.write");
      const r = await newVersion({
        orgId: ctx.session.orgId,
        id: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "agenticGov.newVersion",
        resourceType: "ag_chk_assessment",
        resourceId: r.archived.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      return r;
    }),
});
