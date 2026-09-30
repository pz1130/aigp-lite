import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/lib/prisma";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getCostSummary, type CostBucket } from "./cost";
import { PRICES } from "./prices";

const periodSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

async function safeCostSummary(
  opts: Parameters<typeof getCostSummary>[0],
): Promise<CostBucket[]> {
  try {
    return await getCostSummary(opts);
  } catch (e: unknown) {
    // If the cost_usd column is missing (dev SQLite), return empty instead of propagating
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code?: unknown }).code
        : undefined;
    const message = e instanceof Error ? e.message : String(e);
    if (
      code === "42703" ||
      message.includes('"costUsd"') ||
      message.includes('"cost_usd"')
    ) {
      return [];
    }
    throw e;
  }
}

// Safely serialize a Budget row so Decimal fields pass through writeAudit without Prisma serializer errors.
function toPlain(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  // Prisma Decimal — constructor-name sniffing broke across client versions,
  // so use the runtime's own brand check.
  if (Prisma.Decimal.isDecimal(value)) {
    return Number(value);
  }
  // Prisma DateTime fields serialize as plain objects when minified — detect via instanceof or toISOString presence
  if (value instanceof Date) return value.toISOString();
  if ("toISOString" in value && typeof value.toISOString === "function") {
    return value.toISOString();
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = toPlain(v);
  }
  return out;
}

export const finopsRouter = router({
  cost: router({
    summary: orgProcedure
      .input(
        z.object({
          period: periodSchema,
          groupBy: z.enum(["day", "apiKey", "usecase", "model", "provider"]),
        }),
      )
      .query(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.read");
        return safeCostSummary({
          orgId: ctx.session.orgId,
          period: input.period,
          groupBy: input.groupBy,
        });
      }),

    totals: orgProcedure
      .input(z.object({ period: periodSchema }))
      .query(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.read");
        const out = await safeCostSummary({
          orgId: ctx.session.orgId,
          period: input.period,
          groupBy: "model",
        });
        const totalCost = out.reduce((s, b) => s + b.costUsd, 0);
        const totalInvocations = out.reduce((s, b) => s + b.invocations, 0);
        const inputTokens = out.reduce((s, b) => s + b.inputTokens, 0);
        const outputTokens = out.reduce((s, b) => s + b.outputTokens, 0);
        return { totalCost, totalInvocations, inputTokens, outputTokens };
      }),
  }),

  budget: router({
    list: orgProcedure.query(async ({ ctx }) => {
      assertPermission(ctx.session.role, "finops.read");
      return ctx.db.budget.findMany({
        where: { orgId: ctx.session.orgId },
        orderBy: { createdAt: "desc" },
      });
    }),

    create: orgProcedure
      .input(
        z.object({
          scope: z.enum(["org", "api_key", "usecase"]),
          scopeRefId: z.string().optional(),
          period: z.enum(["daily", "weekly", "monthly"]),
          amountUsd: z.number().positive(),
          hardCap: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.write");
        if (input.scope !== "org" && !input.scopeRefId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "scopeRefId required for non-org budgets",
          });
        }
        const row = await ctx.db.budget.create({
          data: {
            orgId: ctx.session.orgId,
            scope: input.scope,
            scopeRefId: input.scope === "org" ? null : input.scopeRefId,
            period: input.period,
            amountUsd: input.amountUsd,
            hardCap: input.hardCap,
            createdBy: ctx.session.userId,
          },
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "finops.budget.create",
          resourceType: "budget",
          resourceId: row.id,
          after: toPlain(row),
        });
        return row;
      }),

    update: orgProcedure
      .input(
        z.object({
          id: z.string(),
          amountUsd: z.number().positive().optional(),
          hardCap: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.write");
        const existing = await ctx.db.budget.findFirst({
          where: { id: input.id, orgId: ctx.session.orgId },
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const data: Record<string, unknown> = {};
        if (input.amountUsd !== undefined) data.amountUsd = input.amountUsd;
        if (input.hardCap !== undefined) data.hardCap = input.hardCap;
        if (input.isActive !== undefined) data.isActive = input.isActive;
        const row = await ctx.db.budget.update({
          where: { id: input.id },
          data,
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "finops.budget.update",
          resourceType: "budget",
          resourceId: row.id,
          before: toPlain(existing),
          after: toPlain(row),
        });
        return row;
      }),

    delete: orgProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.delete");
        const existing = await ctx.db.budget.findFirst({
          where: { id: input.id, orgId: ctx.session.orgId },
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await ctx.db.budget.delete({ where: { id: input.id } });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "finops.budget.delete",
          resourceType: "budget",
          resourceId: existing.id,
          before: toPlain(existing),
        });
        return { ok: true as const };
      }),
  }),

  pricing: router({
    catalog: orgProcedure.query(async ({ ctx }) => {
      assertPermission(ctx.session.role, "finops.read");
      const conns = await ctx.db.providerConnection.findMany({
        where: { orgId: ctx.session.orgId },
        select: { id: true, name: true, providerType: true, config: true },
      });
      return {
        builtIn: PRICES,
        connections: conns.map((c) => {
          const cfg = (c.config ?? {}) as Record<string, unknown>;
          const raw = cfg.pricingOverride;
          const override =
            raw && typeof raw === "object"
              ? (raw as Record<
                  string,
                  { inputPerMillion: number; outputPerMillion: number }
                >)
              : {};
          return {
            id: c.id,
            name: c.name,
            providerType: c.providerType,
            override,
          };
        }),
      };
    }),

    setOverride: orgProcedure
      .input(
        z.object({
          connectionId: z.string(),
          model: z.string().min(1).max(120),
          inputPerMillion: z.number().min(0),
          outputPerMillion: z.number().min(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.write");
        const conn = await ctx.db.providerConnection.findFirst({
          where: { id: input.connectionId, orgId: ctx.session.orgId },
        });
        if (!conn) throw new TRPCError({ code: "NOT_FOUND" });
        const cfg = (conn.config ?? {}) as Record<string, unknown>;
        const prev = (cfg.pricingOverride ?? {}) as Record<
          string,
          { inputPerMillion: number; outputPerMillion: number }
        >;
        const next = {
          ...prev,
          [input.model]: {
            inputPerMillion: input.inputPerMillion,
            outputPerMillion: input.outputPerMillion,
          },
        };
        await ctx.db.providerConnection.update({
          where: { id: conn.id },
          data: { config: { ...cfg, pricingOverride: next } },
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "finops.pricing.override.set",
          resourceType: "provider_connection",
          resourceId: conn.id,
          after: {
            model: input.model,
            inputPerMillion: input.inputPerMillion,
            outputPerMillion: input.outputPerMillion,
          },
        });
        return { ok: true as const };
      }),

    clearOverride: orgProcedure
      .input(z.object({ connectionId: z.string(), model: z.string() }))
      .mutation(async ({ ctx, input }) => {
        assertPermission(ctx.session.role, "finops.write");
        const conn = await ctx.db.providerConnection.findFirst({
          where: { id: input.connectionId, orgId: ctx.session.orgId },
        });
        if (!conn) throw new TRPCError({ code: "NOT_FOUND" });
        const cfg = (conn.config ?? {}) as Record<string, unknown>;
        const prev = (cfg.pricingOverride ?? {}) as Record<string, unknown>;
        const { [input.model]: _removed, ...rest } = prev;
        await ctx.db.providerConnection.update({
          where: { id: conn.id },
          data: {
            config: {
              ...cfg,
              pricingOverride: rest,
            } as Prisma.InputJsonValue,
          },
        });
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "finops.pricing.override.clear",
          resourceType: "provider_connection",
          resourceId: conn.id,
          after: { model: input.model },
        });
        return { ok: true as const };
      }),
  }),
});
