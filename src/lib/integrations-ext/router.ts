import { randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { EnterpriseIntegration } from "@/lib/prisma";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { encryptJson } from "@/lib/crypto/secrets";
import { assertSafeDestinationInput } from "@/lib/egress/trpc";
import { CATALOG, getIntegrationCatalogEntry } from "./catalog";
import { SUBSCRIBABLE_EVENTS } from "./types";
import { dispatchOutbound } from "./subscriber";

const SUBSCRIBABLE = SUBSCRIBABLE_EVENTS as readonly string[];
const eventEnum = z.enum(
  SUBSCRIBABLE_EVENTS as unknown as [string, ...string[]],
);

function publicShape(row: EnterpriseIntegration) {
  const {
    credentialsEncrypted: _credentialsEncrypted,
    inboundSecret,
    ...rest
  } = row;
  return { ...rest, inboundSecret: inboundSecret ? "•••" : null };
}

export const integrationsExtRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "integrations.read");
    const rows = await ctx.db.enterpriseIntegration.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map(publicShape);
  }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.read");
      const row = await ctx.db.enterpriseIntegration.findFirst({
        where: { id: input.id },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const logs = await ctx.db.integrationSyncLog.findMany({
        where: { integrationId: row.id },
        orderBy: { occurredAt: "desc" },
        take: 50,
      });
      return { ...publicShape(row), recentLogs: logs };
    }),

  catalog: orgProcedure.query(() => CATALOG),

  events: orgProcedure.query(() => SUBSCRIBABLE),

  create: orgProcedure
    .input(
      z.object({
        integrationType: z.enum([
          "slack_webhook",
          "teams_webhook",
          "servicenow",
        ]),
        name: z.string().min(1).max(80),
        credentials: z.record(z.string(), z.string()),
        config: z.record(z.string(), z.unknown()).default({}),
        subscribedEvents: z.array(eventEnum).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      const entry = getIntegrationCatalogEntry(input.integrationType);
      for (const f of entry.credFields) {
        if (f.required && !input.credentials[f.key]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `credential ${f.key} required`,
          });
        }
      }
      for (const f of entry.configFields) {
        if (f.required && !(input.config as Record<string, unknown>)[f.key]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `config ${f.key} required`,
          });
        }
      }

      if (input.credentials.webhookUrl) {
        await assertSafeDestinationInput(input.credentials.webhookUrl);
      }
      const instanceUrl = (input.config as Record<string, unknown>).instanceUrl;
      if (typeof instanceUrl === "string" && instanceUrl) {
        await assertSafeDestinationInput(instanceUrl);
      }

      const inboundSecret = entry.inboundEnabled
        ? randomBytes(24).toString("base64url")
        : null;

      const row = await ctx.db.enterpriseIntegration.create({
        data: {
          name: input.name,
          integrationType: input.integrationType,
          credentialsEncrypted: encryptJson(input.credentials),
          config: input.config,
          subscribedEvents: input.subscribedEvents,
          inboundSecret,
          createdBy: ctx.session.userId,
        } as never,
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "integration.connector.create",
        resourceType: "enterprise_integration",
        resourceId: row.id,
        after: {
          name: row.name,
          integrationType: row.integrationType,
          subscribedEvents: row.subscribedEvents,
        },
      });

      return { ...publicShape(row), inboundSecret };
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        credentials: z.record(z.string(), z.string()).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        subscribedEvents: z.array(eventEnum).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      const existing = await ctx.db.enterpriseIntegration.findFirst({
        where: { id: input.id },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.credentials?.webhookUrl) {
        await assertSafeDestinationInput(input.credentials.webhookUrl);
      }
      if (input.config !== undefined) {
        const instanceUrl = (input.config as Record<string, unknown>)
          .instanceUrl;
        if (typeof instanceUrl === "string" && instanceUrl) {
          await assertSafeDestinationInput(instanceUrl);
        }
      }

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.config !== undefined) data.config = input.config;
      if (input.subscribedEvents !== undefined)
        data.subscribedEvents = input.subscribedEvents;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.credentials !== undefined)
        data.credentialsEncrypted = encryptJson(input.credentials);

      const row = await ctx.db.enterpriseIntegration.update({
        where: { id: input.id },
        data,
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "integration.connector.update",
        resourceType: "enterprise_integration",
        resourceId: row.id,
        before: {
          name: existing.name,
          subscribedEvents: existing.subscribedEvents,
          isActive: existing.isActive,
        },
        after: {
          name: row.name,
          subscribedEvents: row.subscribedEvents,
          isActive: row.isActive,
        },
      });

      return publicShape(row);
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.delete");
      const existing = await ctx.db.enterpriseIntegration.findFirst({
        where: { id: input.id },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.enterpriseIntegration.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "integration.connector.delete",
        resourceType: "enterprise_integration",
        resourceId: existing.id,
        before: {
          name: existing.name,
          integrationType: existing.integrationType,
        },
      });
      return { ok: true };
    }),

  test: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      const row = await ctx.db.enterpriseIntegration.findFirst({
        where: { id: input.id },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await dispatchOutbound({
        type: "integration.test",
        orgId: ctx.session.orgId,
        resourceType: "enterprise_integration",
        resourceId: row.id,
        payload: { initiatedBy: ctx.session.userId, name: row.name },
        occurredAt: new Date(),
      });
      return { ok: true };
    }),
});
