import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { TRPCError } from "@trpc/server";

const sensitivitySchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
]);
const originSchema = z.enum(["first_party", "third_party", "public_dataset"]);
const directionSchema = z.enum([
  "training",
  "inference_input",
  "inference_output",
]);

export const dataLineageRouter = router({
  // List all data sources for the org
  list: orgProcedure.query(({ ctx }) =>
    ctx.db.dataSource.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        links: {
          include: { usecase: { select: { id: true, name: true } } },
        },
      },
    }),
  ),

  // Get a single data source with linked usecases
  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ds = await ctx.db.dataSource.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          links: {
            include: {
              usecase: { select: { id: true, name: true } },
            },
          },
        },
      });
      if (!ds) throw new TRPCError({ code: "NOT_FOUND" });
      return ds;
    }),

  // Create a data source
  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(1000).default(""),
        sensitivity: sensitivitySchema.default("internal"),
        origin: originSchema.default("first_party"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "data_lineage.write");
      const created = await ctx.db.dataSource.create({
        data: { orgId: ctx.session.orgId, ...input },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "data_source.create",
        resourceType: "data_source",
        resourceId: created.id,
        after: { name: created.name, sensitivity: created.sensitivity },
        ip: ctx.ip,
      });
      return created;
    }),

  // Update a data source
  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(1000).optional(),
        sensitivity: sensitivitySchema.optional(),
        origin: originSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "data_lineage.write");
      const { id, ...rest } = input;
      const updated = await ctx.db.dataSource.update({
        where: { id },
        data: rest,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "data_source.update",
        resourceType: "data_source",
        resourceId: id,
        after: rest,
        ip: ctx.ip,
      });
      return updated;
    }),

  // Delete a data source
  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "data_lineage.write");
      await ctx.db.dataSource.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "data_source.delete",
        resourceType: "data_source",
        resourceId: input.id,
        ip: ctx.ip,
      });
      return { ok: true as const };
    }),

  // Link a usecase to a data source (upsert by composite PK)
  linkUsecase: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        dataSourceId: z.string(),
        purpose: z.string().max(200).default(""),
        direction: directionSchema.default("training"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "data_lineage.write");
      const link = await ctx.db.usecaseDataLink.upsert({
        where: {
          usecaseId_dataSourceId_direction: {
            usecaseId: input.usecaseId,
            dataSourceId: input.dataSourceId,
            direction: input.direction,
          },
        },
        create: input,
        update: { purpose: input.purpose },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "data_source.link_usecase",
        resourceType: "usecase_data_link",
        resourceId: `${input.usecaseId}:${input.dataSourceId}:${input.direction}`,
        after: input,
        ip: ctx.ip,
      });
      return link;
    }),

  // Unlink a usecase from a data source
  unlinkUsecase: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        dataSourceId: z.string(),
        direction: directionSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "data_lineage.write");
      await ctx.db.usecaseDataLink.delete({
        where: {
          usecaseId_dataSourceId_direction: {
            usecaseId: input.usecaseId,
            dataSourceId: input.dataSourceId,
            direction: input.direction,
          },
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "data_source.unlink_usecase",
        resourceType: "usecase_data_link",
        resourceId: `${input.usecaseId}:${input.dataSourceId}:${input.direction}`,
        ip: ctx.ip,
      });
      return { ok: true as const };
    }),

  // Get all links for a usecase
  byUsecase: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.usecaseDataLink.findMany({
        where: { usecaseId: input.usecaseId },
        include: { dataSource: true },
      }),
    ),
});
