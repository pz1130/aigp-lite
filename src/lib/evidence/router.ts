import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { TRPCError } from "@trpc/server";
import { store } from "@/lib/storage";

const evidenceStoreSchema = z.object({
  usecaseId: z.string().optional(),
  controlId: z.string().optional(),
  notes: z.string().max(1000).default(""),
});

export const evidenceRouter = router({
  // Upload a file and create an evidence record
  upload: orgProcedure
    .input(
      z.object({
        file: z.instanceof(File),
        usecaseId: evidenceStoreSchema.shape.usecaseId.optional(),
        controlId: evidenceStoreSchema.shape.controlId.optional(),
        notes: evidenceStoreSchema.shape.notes,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "evidence.write");

      const { path, sha256, bytes } = await store(
        ctx.session.orgId,
        input.file,
      );

      const rec = await ctx.db.evidence.create({
        data: {
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId,
          controlId: input.controlId,
          filename: input.file.name,
          filePath: path,
          mimeType: input.file.type,
          bytes,
          sha256,
          uploadedById: ctx.session.userId,
          notes: input.notes,
        },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "evidence.upload",
        resourceType: "evidence",
        resourceId: rec.id,
        after: { filename: input.file.name, mimeType: input.file.type, bytes },
        ip: ctx.ip,
      });

      return rec;
    }),

  // List evidence for the org (optionally scoped to a usecase)
  list: orgProcedure
    .input(
      z
        .object({
          usecaseId: z.string().optional(),
          controlId: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { orgId: ctx.session.orgId };
      if (input?.usecaseId) where.usecaseId = input.usecaseId;
      if (input?.controlId) where.controlId = input.controlId;

      return ctx.db.evidence.findMany({
        where,
        orderBy: { uploadedAt: "desc" },
        take: (input?.limit ?? 50) + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
    }),

  // Get metadata for a single evidence record
  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rec = await ctx.db.evidence.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      return rec;
    }),
});
