import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { generateRca } from "./orchestrator";
import { isRcaEnabled } from "./config";

export const incidentRcaRouter = router({
  isEnabled: orgProcedure.query(() => ({ enabled: isRcaEnabled() })),

  suggest: orgProcedure
    .input(z.object({ incidentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      if (!isRcaEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "incident-rca is disabled",
        });
      }
      const r = await generateRca({
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
        incidentId: input.incidentId,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident_rca.suggest",
        resourceType: "Incident",
        resourceId: input.incidentId,
        after: {
          draftId: r.draftId,
          status: r.status,
          retryCount: r.retryCount,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          timelineCount: r.timeline.length,
          recCount: r.recommendations.length,
          diagnosticCodes: r.diagnostics.map((d) => d.code),
        },
      });
      return r;
    }),

  latest: orgProcedure
    .input(z.object({ incidentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.read");
      return ctx.db.incidentRcaDraft.findFirst({
        where: { orgId: ctx.session.orgId, incidentId: input.incidentId },
        orderBy: { requestedAt: "desc" },
      });
    }),

  history: orgProcedure
    .input(
      z.object({
        incidentId: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.read");
      return ctx.db.incidentRcaDraft.findMany({
        where: { orgId: ctx.session.orgId, incidentId: input.incidentId },
        orderBy: { requestedAt: "desc" },
        take: input.limit,
      });
    }),

  accept: orgProcedure
    .input(z.object({ draftId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");

      const draft = await ctx.db.incidentRcaDraft.findFirst({
        where: { id: input.draftId, orgId: ctx.session.orgId },
        include: { incident: true },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });

      const alreadyAccepted = draft.acceptedAt !== null;
      const prior = draft.incident.rootCause ?? "";
      const overwroteExistingRootCause =
        prior.trim().length > 0 && !alreadyAccepted;

      let nextRoot = `## Summary\n\n${draft.summary}\n\n## Root Cause\n\n${draft.rootCause}`;
      if (overwroteExistingRootCause) {
        nextRoot += `\n\n## Prior notes\n\n${prior}`;
      }

      if (!alreadyAccepted) {
        await ctx.db.$transaction([
          ctx.db.incident.update({
            where: { id: draft.incidentId },
            data: { rootCause: nextRoot },
          }),
          ctx.db.incidentRcaDraft.update({
            where: { id: draft.id },
            data: { acceptedById: ctx.session.userId, acceptedAt: new Date() },
          }),
        ]);
      }

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident_rca.accept",
        resourceType: "Incident",
        resourceId: draft.incidentId,
        after: {
          draftId: draft.id,
          rootCauseLength: nextRoot.length,
          overwroteExistingRootCause,
          alreadyAccepted,
        },
      });

      return { ok: true as const, alreadyAccepted, overwroteExistingRootCause };
    }),

  reject: orgProcedure
    .input(z.object({ draftId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      const draft = await ctx.db.incidentRcaDraft.findFirst({
        where: { id: input.draftId, orgId: ctx.session.orgId },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident_rca.reject",
        resourceType: "IncidentRcaDraft",
        resourceId: draft.id,
        after: { incidentId: draft.incidentId },
      });
      return { ok: true as const };
    }),
});
