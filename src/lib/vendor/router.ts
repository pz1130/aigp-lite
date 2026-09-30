import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  upsertAnswers,
  setRatingOverride,
  clearOverride,
  linkUsecase,
  unlinkUsecase,
  VendorError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof VendorError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

const vendorTypeEnum = z.enum([
  "model_provider",
  "data_vendor",
  "tooling_vendor",
]);
const ratingEnum = z.enum(["low", "medium", "high", "critical"]);
const statusEnum = z.enum(["yes", "partial", "no", "not_applicable"]);

export const vendorRouter = router({
  list: orgProcedure.query(({ ctx }) => listVendors(ctx.session.orgId)),

  get: orgProcedure
    .input(z.object({ vendorId: z.string() }))
    .query(({ ctx, input }) => getVendor(ctx.session.orgId, input.vendorId)),

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1),
        vendorType: vendorTypeEnum,
        description: z.string().nullish(),
        providerConnectionId: z.string().nullish(),
        dataResidency: z.string().nullish(),
        contractRenewalDate: z.string().date().nullish(),
        modelChangeNotice: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      const { contractRenewalDate, ...rest } = input;
      return createVendor({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        input: {
          ...rest,
          contractRenewalDate: contractRenewalDate
            ? new Date(contractRenewalDate)
            : null,
        },
      }).catch(translate);
    }),

  update: orgProcedure
    .input(
      z.object({
        vendorId: z.string(),
        name: z.string().min(1).optional(),
        vendorType: vendorTypeEnum.optional(),
        description: z.string().nullish(),
        providerConnectionId: z.string().nullish(),
        dataResidency: z.string().nullish(),
        contractRenewalDate: z.string().date().nullish(),
        modelChangeNotice: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      const { vendorId, contractRenewalDate, ...rest } = input;
      return updateVendor({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        vendorId,
        input: {
          ...rest,
          contractRenewalDate:
            contractRenewalDate === undefined
              ? undefined
              : contractRenewalDate
                ? new Date(contractRenewalDate)
                : null,
        },
      }).catch(translate);
    }),

  upsertAnswers: orgProcedure
    .input(
      z.object({
        vendorId: z.string(),
        answers: z.array(
          z.object({
            itemCode: z.string(),
            status: statusEnum,
            note: z.string().nullish(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      return upsertAnswers({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        vendorId: input.vendorId,
        answers: input.answers,
      }).catch(translate);
    }),

  setOverride: orgProcedure
    .input(
      z.object({
        vendorId: z.string(),
        rating: ratingEnum,
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      return setRatingOverride({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        vendorId: input.vendorId,
        rating: input.rating,
        reason: input.reason,
      }).catch(translate);
    }),

  clearOverride: orgProcedure
    .input(z.object({ vendorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      return clearOverride({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        vendorId: input.vendorId,
      }).catch(translate);
    }),

  link: orgProcedure
    .input(z.object({ vendorId: z.string(), usecaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      return linkUsecase({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        vendorId: input.vendorId,
        usecaseId: input.usecaseId,
      }).catch(translate);
    }),

  unlink: orgProcedure
    .input(z.object({ vendorId: z.string(), usecaseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "vendor.write");
      return unlinkUsecase({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        ip: ctx.ip,
        vendorId: input.vendorId,
        usecaseId: input.usecaseId,
      }).catch(translate);
    }),
});
