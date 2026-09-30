import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { suggestRisks } from "./orchestrator";
import { isCopilotEnabled, getDailyLimit } from "./config";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";

export const riskCopilotRouter = router({
  isEnabled: orgProcedure.query(() => ({ enabled: isCopilotEnabled() })),

  usageToday: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "risk.read");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = await ctx.db.riskCopilotSuggestion.count({
      where: { orgId: ctx.session.orgId, requestedAt: { gte: start } },
    });
    return { used, limit: getDailyLimit() };
  }),

  suggest: orgProcedure
    .input(z.object({ usecaseId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      if (!isCopilotEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "risk-copilot is disabled",
        });
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const used = await ctx.db.riskCopilotSuggestion.count({
        where: { orgId: ctx.session.orgId, requestedAt: { gte: start } },
      });
      if (used >= getDailyLimit()) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Daily quota of ${getDailyLimit()} reached`,
        });
      }

      const r = await suggestRisks({
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
        usecaseId: input.usecaseId,
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk_copilot.suggest",
        resourceType: "AiUsecase",
        resourceId: input.usecaseId,
        after: {
          suggestionId: r.suggestionId,
          status: r.status,
          itemCount: r.items.length,
          retryCount: r.retryCount,
        },
      });

      return r;
    }),

  latest: orgProcedure
    .input(z.object({ usecaseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.read");
      return ctx.db.riskCopilotSuggestion.findFirst({
        where: { orgId: ctx.session.orgId, usecaseId: input.usecaseId },
        include: { items: { include: { risk: true } } },
        orderBy: { requestedAt: "desc" },
      });
    }),

  history: orgProcedure
    .input(
      z.object({
        usecaseId: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.read");
      return ctx.db.riskCopilotSuggestion.findMany({
        where: { orgId: ctx.session.orgId, usecaseId: input.usecaseId },
        orderBy: { requestedAt: "desc" },
        take: input.limit,
      });
    }),

  decide: orgProcedure
    .input(
      z.object({
        itemId: z.string().min(1),
        decision: z.enum(["accepted", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      return decideOne(ctx, input.itemId, input.decision);
    }),

  bulkDecide: orgProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        accepts: z.array(z.string()).default([]),
        rejects: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const results: Array<{
        itemId: string;
        ok: boolean;
        alreadyLinked?: boolean;
      }> = [];
      for (const id of input.accepts)
        results.push({ itemId: id, ...(await decideOne(ctx, id, "accepted")) });
      for (const id of input.rejects)
        results.push({ itemId: id, ...(await decideOne(ctx, id, "rejected")) });
      return { results };
    }),

  unlink: orgProcedure
    .input(z.object({ linkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.write");
      const link = await ctx.db.usecaseCatalogRiskLink.findFirst({
        where: { id: input.linkId, orgId: ctx.session.orgId },
      });
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.usecaseCatalogRiskLink.delete({ where: { id: link.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "risk_copilot.unlink",
        resourceType: "UsecaseCatalogRiskLink",
        resourceId: link.id,
        after: { riskCatalogId: link.riskCatalogId, usecaseId: link.usecaseId },
      });
      return { ok: true };
    }),

  linkedRisks: orgProcedure
    .input(z.object({ usecaseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "risk.read");
      return ctx.db.usecaseCatalogRiskLink.findMany({
        where: { orgId: ctx.session.orgId, usecaseId: input.usecaseId },
        include: {
          risk: true,
          acceptedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { acceptedAt: "desc" },
      });
    }),
});

async function decideOne(
  ctx: { db: OrgScopedClient; session: { orgId: string; userId: string } },
  itemId: string,
  decision: "accepted" | "rejected",
): Promise<{ ok: boolean; alreadyLinked?: boolean }> {
  const item = await ctx.db.riskCopilotSuggestionItem.findFirst({
    where: { id: itemId, suggestion: { orgId: ctx.session.orgId } },
    include: { suggestion: true, risk: true },
  });
  if (!item) throw new TRPCError({ code: "NOT_FOUND" });

  let alreadyLinked = false;
  if (decision === "accepted") {
    const existing = await ctx.db.usecaseCatalogRiskLink.findUnique({
      where: {
        orgId_usecaseId_riskCatalogId: {
          orgId: ctx.session.orgId,
          usecaseId: item.suggestion.usecaseId,
          riskCatalogId: item.riskCatalogId,
        },
      },
    });
    if (existing) {
      alreadyLinked = true;
    } else {
      await ctx.db.usecaseCatalogRiskLink.create({
        data: {
          orgId: ctx.session.orgId,
          usecaseId: item.suggestion.usecaseId,
          riskCatalogId: item.riskCatalogId,
          severity: item.severity,
          source: "ai",
          rationale: item.rationale,
          acceptedById: ctx.session.userId,
        },
      });
    }
    const mitigationIds = (item.mitigationIds as string[]) ?? [];
    for (const controlId of mitigationIds) {
      const existingCs = await ctx.db.usecaseControlStatus.findUnique({
        where: {
          usecaseId_controlId: {
            usecaseId: item.suggestion.usecaseId,
            controlId,
          },
        },
      });
      if (existingCs && existingCs.status === "satisfied") continue;
      await ctx.db.usecaseControlStatus.upsert({
        where: {
          usecaseId_controlId: {
            usecaseId: item.suggestion.usecaseId,
            controlId,
          },
        },
        create: {
          orgId: ctx.session.orgId,
          usecaseId: item.suggestion.usecaseId,
          controlId,
          status: "not_started",
        },
        update: { status: "not_started" },
      });
    }
  }

  await ctx.db.riskCopilotSuggestionItem.update({
    where: { id: item.id },
    data: { decision, decidedById: ctx.session.userId, decidedAt: new Date() },
  });

  await writeAudit({
    orgId: ctx.session.orgId,
    actorId: ctx.session.userId,
    action:
      decision === "accepted" ? "risk_copilot.accept" : "risk_copilot.reject",
    resourceType: "RiskCopilotSuggestionItem",
    resourceId: item.id,
    after: {
      riskCatalogId: item.riskCatalogId,
      severity: item.severity,
      mitigationIds: item.mitigationIds,
      alreadyLinked,
    },
  });

  return { ok: true, alreadyLinked };
}
