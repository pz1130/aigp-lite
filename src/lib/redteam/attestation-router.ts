import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { remove } from "@/lib/storage";

export const redteamAttestationRouter = router({
  list: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "redteam.read");
      return ctx.db.redteamAttestation.findMany({
        where: { orgId: ctx.session.orgId, usecaseId: input.usecaseId },
        orderBy: { attestedAt: "desc" },
      });
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "redteam.write");
      const row = await ctx.db.redteamAttestation.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        await remove(row.storageKey);
      } catch {
        // file already gone — proceed with row deletion
      }
      await ctx.db.redteamAttestation.delete({ where: { id: row.id } });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "redteam_attestation.deleted",
        resourceType: "redteam_attestation",
        resourceId: row.id,
        before: { attesterName: row.attesterName, usecaseId: row.usecaseId },
        ip: ctx.ip,
      });

      return { ok: true };
    }),
});
