import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@/lib/prisma";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { buildDossierSnapshot } from "./aggregate";
import { evaluateReadiness } from "./readiness";
import { recheckStaleApproval, resolveApprovalBinding } from "./stale-approval";
import { buildReadinessRollup } from "./rollup";
import { workflowEvents } from "@/lib/events/workflow-bus";
import {
  aggregateSystemCard,
  systemCardFilename,
  type SystemCardData,
} from "@/lib/system-card/aggregator";
import { renderSystemCardMarkdown } from "@/lib/system-card/markdown";
import { renderSystemCardPdf } from "@/lib/system-card/pdf";

async function loadSystemCardData(
  db: OrgScopedClient,
  session: { orgId: string; userId: string },
  usecaseId: string,
): Promise<SystemCardData> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
  });
  const data = await aggregateSystemCard({
    db,
    orgId: session.orgId,
    usecaseId,
    generatedBy: { id: user.id, name: user.name ?? user.email },
  });
  if (!data) throw new TRPCError({ code: "NOT_FOUND" });
  return data;
}

export const dossierRouter = router({
  get: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.read");
      await recheckStaleApproval(ctx.db, ctx.session.orgId, input.usecaseId, {
        triggeredByUserId: ctx.session.userId,
      });
      const snapshot = await buildDossierSnapshot(
        ctx.db,
        ctx.session.orgId,
        input.usecaseId,
      );
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });
      return { snapshot, readiness: evaluateReadiness(snapshot) };
    }),

  rollup: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "inventory.read");
    return buildReadinessRollup(ctx.db, ctx.session.orgId);
  }),

  history: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.read");
      return ctx.db.goLiveReview.findMany({
        where: { orgId: ctx.session.orgId, usecaseId: input.usecaseId },
        orderBy: { createdAt: "desc" },
        include: { decidedBy: { select: { name: true, email: true } } },
      });
    }),

  systemCardMarkdown: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.read");
      const data = await loadSystemCardData(
        ctx.db,
        ctx.session,
        input.usecaseId,
      );
      return {
        markdown: renderSystemCardMarkdown(data),
        filename: systemCardFilename(
          data.snapshot.system.name,
          "md",
          data.generatedAt,
        ),
      };
    }),

  systemCardPdf: orgProcedure
    .input(z.object({ usecaseId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.read");
      const data = await loadSystemCardData(
        ctx.db,
        ctx.session,
        input.usecaseId,
      );
      const buf = await renderSystemCardPdf(data);
      return {
        base64: buf.toString("base64"),
        filename: systemCardFilename(
          data.snapshot.system.name,
          "pdf",
          data.generatedAt,
        ),
      };
    }),

  recordDecision: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        status: z.enum(["approved", "live", "rejected", "withdrawn"]),
        rationale: z.string().default(""),
        conditions: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "go-live.approve");
      const snapshot = await buildDossierSnapshot(
        ctx.db,
        ctx.session.orgId,
        input.usecaseId,
      );
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });
      const readiness = evaluateReadiness(snapshot);

      if (
        snapshot.system.lifecycleStage === "deprecated" &&
        (input.status === "approved" || input.status === "live")
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "system_deprecated",
        });
      }

      if (
        (input.status === "approved" || input.status === "live") &&
        readiness.blockingFailing > 0
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "blocking_checks_failing",
        });
      }

      const current = await ctx.db.goLiveReview.findFirst({
        where: {
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId,
          supersededById: null,
        },
      });

      const binding =
        input.status === "approved" || input.status === "live"
          ? await resolveApprovalBinding(
              ctx.db,
              input.usecaseId,
              snapshot.capability.effectiveTier,
            )
          : null;

      const created = await ctx.db.goLiveReview.create({
        data: {
          orgId: ctx.session.orgId,
          usecaseId: input.usecaseId,
          status: input.status,
          rationale: input.rationale,
          conditions: input.conditions,
          // Prisma 7's InputJsonValue no longer accepts arrays of typed
          // objects (ReadinessCheck[]) without an explicit cast.
          readinessSnapshot: {
            checks: readiness.checks,
            state: readiness.state,
            blockingFailing: readiness.blockingFailing,
            advisoryOpen: readiness.advisoryOpen,
            capturedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
          boundTier: binding?.boundTier ?? null,
          boundModelRef: binding?.boundModelRef ?? null,
          staleApproval: false,
          decidedById: ctx.session.userId,
          decidedAt: new Date(),
          createdById: ctx.session.userId,
        },
      });

      if (current) {
        await ctx.db.goLiveReview.update({
          where: { id: current.id },
          data: { supersededById: created.id },
        });
      }

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "go_live.decision",
        resourceType: "go_live_review",
        resourceId: created.id,
        after: { status: input.status, state: readiness.state },
        ip: ctx.ip,
      });

      workflowEvents.emitGoLiveDecided({
        orgId: ctx.session.orgId,
        usecaseId: input.usecaseId,
        reviewId: created.id,
        status: input.status,
        decidedByUserId: ctx.session.userId,
      });

      return created;
    }),

  setOversightAttestation: orgProcedure
    .input(z.object({ usecaseId: z.string(), value: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "inventory.write");
      const u = await ctx.db.aiUsecase.findFirst({
        where: { id: input.usecaseId, orgId: ctx.session.orgId },
      });
      if (!u) throw new TRPCError({ code: "NOT_FOUND" });

      const updated = await ctx.db.aiUsecase.update({
        where: { id: u.id },
        data: {
          humanOversightAttested: input.value,
          humanOversightAttestedById: input.value ? ctx.session.userId : null,
          humanOversightAttestedAt: input.value ? new Date() : null,
        },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "go_live.oversight_attestation",
        resourceType: "ai_usecase",
        resourceId: u.id,
        after: { humanOversightAttested: input.value },
        ip: ctx.ip,
      });

      return { humanOversightAttested: updated.humanOversightAttested };
    }),
});
