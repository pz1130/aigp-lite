import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import {
  createFria,
  updateDraftSections,
  submitFria,
  withdrawFria,
  approveFria,
  supersedeFria,
  archiveFria,
  listFriasForUsecase,
  FriaStateError,
} from "./service";
import { friaSectionsSchema } from "./sections-schema";

function translate(err: unknown): never {
  if (err instanceof FriaStateError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

export const friaRouter = router({
  listForUsecase: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(({ ctx, input }) =>
      listFriasForUsecase({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
      }),
    ),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.db.usecaseFria.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
        },
      });
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      return r;
    }),

  create: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        title: z.string().min(1).max(200),
        initialSections: friaSectionsSchema.partial().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fria.write");
      const rec = await createFria({
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
        usecaseId: input.usecaseId,
        title: input.title,
        initialSections: input.initialSections,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "fria.create",
        resourceType: "usecase_fria",
        resourceId: rec.id,
        after: { usecaseId: input.usecaseId, title: input.title },
        ip: ctx.ip,
      });
      return rec;
    }),

  updateSections: orgProcedure
    .input(z.object({ id: z.string(), sections: friaSectionsSchema }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fria.write");
      return updateDraftSections({
        orgId: ctx.session.orgId,
        friaId: input.id,
        userId: ctx.session.userId,
        sections: input.sections,
      }).catch(translate);
    }),

  submit: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fria.write");
      const rec = await submitFria({
        orgId: ctx.session.orgId,
        friaId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "fria.submit",
        resourceType: "usecase_fria",
        resourceId: rec.id,
        before: { status: "draft" },
        after: { status: "submitted" },
        ip: ctx.ip,
      });
      return rec;
    }),

  withdraw: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fria.write");
      const rec = await withdrawFria({
        orgId: ctx.session.orgId,
        friaId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "fria.withdraw",
        resourceType: "usecase_fria",
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
      assertPermission(ctx.session.role, "fria.approve");
      const rec = await approveFria({
        orgId: ctx.session.orgId,
        friaId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "fria.approve",
        resourceType: "usecase_fria",
        resourceId: rec.id,
        before: { status: "submitted" },
        after: { status: "approved" },
        ip: ctx.ip,
      });
      return rec;
    }),

  supersede: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fria.write");
      const r = await supersedeFria({
        orgId: ctx.session.orgId,
        friaId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "fria.supersede",
        resourceType: "usecase_fria",
        resourceId: r.archived.id,
        after: { newVersion: r.created.version, newId: r.created.id },
        ip: ctx.ip,
      });
      return r;
    }),

  archive: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "fria.approve");
      const rec = await archiveFria({
        orgId: ctx.session.orgId,
        friaId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "fria.archive",
        resourceType: "usecase_fria",
        resourceId: rec.id,
        before: { status: "approved" },
        after: { status: "archived" },
        ip: ctx.ip,
      });
      return rec;
    }),
});
