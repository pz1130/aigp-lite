import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import {
  getMateriality,
  upsertMateriality,
  setOverride,
  clearOverride,
  materialityInputsSchema,
  MaterialityError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof MaterialityError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

const tierEnum = z.enum(["minimal", "limited", "high", "critical"]);

export const materialityRouter = router({
  get: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(({ ctx, input }) =>
      getMateriality(ctx.session.orgId, input.usecaseId),
    ),

  upsert: orgProcedure
    .input(z.object({ usecaseId: z.string(), inputs: materialityInputsSchema }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "materiality.write");
      return upsertMateriality({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
        actorId: ctx.session.userId,
        inputs: input.inputs,
        ip: ctx.ip,
      }).catch(translate);
    }),

  setOverride: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        tier: tierEnum,
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "materiality.write");
      return setOverride({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
        actorId: ctx.session.userId,
        tier: input.tier,
        reason: input.reason,
        ip: ctx.ip,
      }).catch(translate);
    }),

  clearOverride: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "materiality.write");
      return clearOverride({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
      }).catch(translate);
    }),
});
