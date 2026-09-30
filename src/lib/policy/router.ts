import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { createApiKey } from "@/lib/api-key/manage";
import { TRPCError } from "@trpc/server";
import { loadEffectivePolicies } from "./effective";
import type { Prisma } from "@/lib/prisma";

const policyInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().default(""),
  ruleJson: z.unknown(),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  enforcementMode: z.enum(["block", "warn", "log"]).default("warn"),
  scope: z.enum(["input", "output", "both"]).default("both"),
  enabled: z.boolean().default(true),
});

export const policyRouter = router({
  list: orgProcedure.query(({ ctx }) =>
    ctx.db.policy.findMany({ orderBy: { createdAt: "desc" } }),
  ),
  listEffective: orgProcedure.query(({ ctx }) =>
    loadEffectivePolicies(ctx.session.orgId),
  ),
  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.db.policy.findUnique({ where: { id: input.id } });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      return p;
    }),
  create: orgProcedure.input(policyInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "policy.write");
    const created = await ctx.db.policy.create({
      data: {
        ...input,
        orgId: ctx.session.orgId,
        ruleJson: input.ruleJson as Prisma.InputJsonValue,
      },
    });
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "policy.create",
      resourceType: "policy",
      resourceId: created.id,
      after: { name: created.name },
    });
    return created;
  }),
  update: orgProcedure
    .input(policyInput.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "policy.write");
      const { id, ...rest } = input;
      const { ruleJson, ...fields } = rest;
      const before = await ctx.db.policy.findUnique({ where: { id } });
      const after = await ctx.db.policy.update({
        where: { id },
        data: {
          ...fields,
          ...(ruleJson !== undefined
            ? { ruleJson: ruleJson as Prisma.InputJsonValue }
            : {}),
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "policy.update",
        resourceType: "policy",
        resourceId: id,
        before,
        after,
      });
      return after;
    }),
  remove: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "policy.delete");
      const before = await ctx.db.policy.findUnique({
        where: { id: input.id },
      });
      await ctx.db.policy.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "policy.delete",
        resourceType: "policy",
        resourceId: input.id,
        before,
      });
      return { ok: true as const };
    }),
  recentHits: orgProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(({ ctx, input }) =>
      ctx.db.policyEvaluation.findMany({
        where: { hit: true },
        orderBy: { ts: "desc" },
        take: input.limit,
        include: { policy: true },
      }),
    ),
  apiKeys: router({
    list: orgProcedure.query(({ ctx }) =>
      ctx.db.apiKey.findMany({
        select: {
          id: true,
          label: true,
          prefix: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
    ),
    create: orgProcedure
      .input(z.object({ label: z.string().min(1).max(80) }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "policy.write");
        const r = await createApiKey({
          orgId: ctx.session.orgId,
          label: input.label,
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "apiKey.create",
          resourceType: "api_key",
          resourceId: r.id,
          after: { label: input.label, prefix: r.prefix },
        });
        return r; // includes plaintext `key` — UI must show & forget
      }),
    revoke: orgProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "policy.delete");
        await ctx.db.apiKey.delete({ where: { id: input.id } });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "apiKey.revoke",
          resourceType: "api_key",
          resourceId: input.id,
        });
        return { ok: true as const };
      }),
  }),
  policyHitsThisWeek: orgProcedure.query(async ({ ctx }) => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return ctx.db.policyEvaluation.count({
      where: { orgId: ctx.session.orgId, ts: { gte: oneWeekAgo } },
    });
  }),
});
