import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { TRPCError } from "@trpc/server";
import { computeSlaDeadline, CATEGORY_OWASP_ASI } from "./taxonomy";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { metric } from "@/lib/incidents/metrics";

export const incidentRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          status: z
            .enum(["open", "investigating", "mitigated", "closed"])
            .optional(),
          severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          category: z
            .enum([
              "hijack",
              "capability_breach",
              "data_leak",
              "trust_failure",
              "cascade",
              "audit_failure",
              "resource_abuse",
              "bias_harm",
              "policy_bypass",
            ])
            .optional(),
          showMerged: z.boolean().optional(),
          limit: z.number().min(1).max(100).default(50),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { orgId: ctx.session.orgId };
      if (input?.status) where.status = input.status;
      if (input?.severity) where.severity = input.severity;
      if (input?.category) where.category = input.category;
      if (!input?.showMerged) where.mergedIntoId = null;

      return ctx.db.incident.findMany({
        where,
        orderBy: { openedAt: "desc" },
        take: (input?.limit ?? 50) + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          openedBy: { select: { id: true, name: true, email: true } },
          closedBy: { select: { id: true, name: true, email: true } },
          usecase: { select: { id: true, name: true } },
        },
      });
    }),

  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rec = await ctx.db.incident.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          openedBy: { select: { id: true, name: true, email: true } },
          closedBy: { select: { id: true, name: true, email: true } },
          usecase: { select: { id: true, name: true } },
          policyEvaluation: { select: { id: true, hit: true, snippet: true } },
          llmInvocation: {
            select: { id: true, provider: true, model: true, blocked: true },
          },
        },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      return rec;
    }),

  create: orgProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        severity: z.enum(["low", "medium", "high", "critical"]).default("high"),
        category: z
          .enum([
            "hijack",
            "capability_breach",
            "data_leak",
            "trust_failure",
            "cascade",
            "audit_failure",
            "resource_abuse",
            "bias_harm",
            "policy_bypass",
          ])
          .optional(),
        frameworkRefs: z.record(z.string(), z.array(z.string())).optional(),
        rootCause: z.string().max(2000).default(""),
        relatedUsecaseId: z.string().optional(),
        relatedPolicyEvaluationId: z.string().optional(),
        relatedLlmInvocationId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      const openedAt = new Date();
      const slaDeadline = computeSlaDeadline(input.severity, openedAt);

      let frameworkRefs: Record<string, string[]> | undefined =
        input.frameworkRefs;
      if (!frameworkRefs && input.category) {
        const asi = CATEGORY_OWASP_ASI[input.category];
        if (asi.length > 0) frameworkRefs = { owaspAsi: asi };
      }

      const rec = await ctx.db.incident.create({
        data: {
          orgId: ctx.session.orgId,
          title: input.title,
          severity: input.severity,
          category: input.category ?? null,
          frameworkRefs: frameworkRefs ?? {},
          slaDeadline,
          openedAt,
          rootCause: input.rootCause,
          relatedUsecaseId: input.relatedUsecaseId,
          relatedPolicyEvaluationId: input.relatedPolicyEvaluationId,
          relatedLlmInvocationId: input.relatedLlmInvocationId,
          openedById: ctx.session.userId,
          status: "open",
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident.create",
        resourceType: "incident",
        resourceId: rec.id,
        after: { title: rec.title, severity: rec.severity, status: rec.status },
        ip: ctx.ip,
      });
      await enqueueJob("webhook.deliver", {
        orgId: ctx.session.orgId,
        event: "incident.created",
        data: {
          incidentId: rec.id,
          title: rec.title,
          severity: rec.severity,
          status: rec.status,
        },
      });
      await enqueueJob("incident.suggest-duplicates", { incidentId: rec.id });
      return rec;
    }),

  updateStatus: orgProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["open", "investigating", "mitigated", "closed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      const existing = await ctx.db.incident.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.incident.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.status === "closed"
            ? { closedAt: new Date(), closedById: ctx.session.userId }
            : {}),
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident.status_change",
        resourceType: "incident",
        resourceId: input.id,
        before: { status: existing.status },
        after: { status: input.status },
        ip: ctx.ip,
      });
      if (input.status === "closed") {
        await enqueueJob("webhook.deliver", {
          orgId: ctx.session.orgId,
          event: "incident.resolved",
          data: { incidentId: input.id, title: existing.title },
        });
      }
      return updated;
    }),

  updateClassification: orgProcedure
    .input(
      z.object({
        id: z.string(),
        category: z
          .enum([
            "hijack",
            "capability_breach",
            "data_leak",
            "trust_failure",
            "cascade",
            "audit_failure",
            "resource_abuse",
            "bias_harm",
            "policy_bypass",
          ])
          .nullable()
          .optional(),
        frameworkRefs: z.record(z.string(), z.array(z.string())).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      const existing = await ctx.db.incident.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.incident.update({
        where: { id: input.id },
        data: {
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.frameworkRefs !== undefined
            ? { frameworkRefs: input.frameworkRefs }
            : {}),
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident.reclassify",
        resourceType: "incident",
        resourceId: input.id,
        before: {
          category: existing.category,
          frameworkRefs: existing.frameworkRefs,
        },
        after: {
          category: updated.category,
          frameworkRefs: updated.frameworkRefs,
        },
        ip: ctx.ip,
      });
      return updated;
    }),

  updateSeverity: orgProcedure
    .input(
      z.object({
        id: z.string(),
        severity: z.enum(["low", "medium", "high", "critical"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      const existing = await ctx.db.incident.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const slaDeadline = computeSlaDeadline(input.severity, existing.openedAt);
      const updated = await ctx.db.incident.update({
        where: { id: input.id },
        data: { severity: input.severity, slaDeadline },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident.severity_change",
        resourceType: "incident",
        resourceId: input.id,
        before: {
          severity: existing.severity,
          slaDeadline: existing.slaDeadline,
        },
        after: { severity: updated.severity, slaDeadline: updated.slaDeadline },
        ip: ctx.ip,
      });
      return updated;
    }),

  openCount: orgProcedure.query(async ({ ctx }) => {
    return ctx.db.incident.count({
      where: { orgId: ctx.session.orgId, status: "open" },
    });
  }),

  overdueCount: orgProcedure.query(({ ctx }) =>
    ctx.db.incident.count({
      where: {
        orgId: ctx.session.orgId,
        status: { in: ["open", "investigating"] },
        slaDeadline: { lt: new Date() },
      },
    }),
  ),

  mergeInto: orgProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      if (input.sourceId === input.targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot merge an incident into itself",
        });
      }
      const [source, target] = await Promise.all([
        ctx.db.incident.findFirst({
          where: { id: input.sourceId, orgId: ctx.session.orgId },
        }),
        ctx.db.incident.findFirst({
          where: { id: input.targetId, orgId: ctx.session.orgId },
        }),
      ]);
      if (!source || !target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Incident not found in this org",
        });
      if (source.mergedIntoId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source already merged",
        });

      const now = new Date();
      await ctx.db.$transaction([
        ctx.db.incident.update({
          where: { id: source.id },
          data: {
            mergedIntoId: target.id,
            status: "closed",
            closedAt: now,
            closedById: ctx.session.userId,
          },
        }),
        ctx.db.incidentRcaDraft.updateMany({
          where: { incidentId: source.id, orgId: ctx.session.orgId },
          data: { incidentId: target.id },
        }),
        ctx.db.incidentMergeSuggestion.updateMany({
          where: {
            incidentId: source.id,
            candidateIncidentId: target.id,
            acceptedAt: null,
          },
          data: { acceptedAt: now, acceptedById: ctx.session.userId },
        }),
      ]);

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "incident.merged",
        resourceType: "incident",
        resourceId: source.id,
        after: { mergedIntoId: target.id },
        ip: ctx.ip,
      });
      metric("incident.dedup.merged");
      return { ok: true };
    }),

  dismissSuggestion: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "incident.write");
      const sug = await ctx.db.incidentMergeSuggestion.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!sug) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.incidentMergeSuggestion.update({
        where: { id: sug.id },
        data: { dismissedAt: new Date(), dismissedById: ctx.session.userId },
      });
      return { ok: true };
    }),

  getMergeSuggestion: orgProcedure
    .input(z.object({ incidentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.incidentMergeSuggestion.findFirst({
        where: {
          orgId: ctx.session.orgId,
          incidentId: input.incidentId,
          dismissedAt: null,
          acceptedAt: null,
        },
        orderBy: { similarity: "desc" },
        include: {
          candidate: {
            select: { id: true, title: true, status: true, openedAt: true },
          },
        },
      });
    }),
});
