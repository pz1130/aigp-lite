import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import {
  getAssessment,
  saveDraft,
  completeAssessment,
  reopenAssessment,
  FairnessError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof FairnessError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

const checkEnum = z.enum(["yes", "no", "not_applicable"]);
const metricEnum = z.enum([
  "selection_rate",
  "true_positive_rate",
  "error_rate",
  "precision",
]);

const attributeSchema = z.object({
  name: z.string().min(1),
  metric: metricEnum,
  subgroups: z.array(z.object({ label: z.string().min(1), value: z.number() })),
});

export const fairnessRouter = router({
  get: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(({ ctx, input }) =>
      getAssessment(ctx.session.orgId, input.usecaseId),
    ),

  save: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        proxyReview: checkEnum.nullable(),
        feedbackLoop: checkEnum.nullable(),
        attributes: z.array(attributeSchema),
        notes: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fairness.write");
      return saveDraft({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        usecaseId: input.usecaseId,
        proxyReview: input.proxyReview,
        feedbackLoop: input.feedbackLoop,
        attributes: input.attributes,
        notes: input.notes ?? null,
      }).catch(translate);
    }),

  complete: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fairness.write");
      return completeAssessment({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        usecaseId: input.usecaseId,
      }).catch(translate);
    }),

  reopen: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fairness.write");
      return reopenAssessment({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        usecaseId: input.usecaseId,
      }).catch(translate);
    }),
});
