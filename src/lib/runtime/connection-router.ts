import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { assertSafeDestinationInput } from "@/lib/egress/trpc";
import { CATALOG } from "./catalog";
import { getAdapter } from "@/lib/runtime/providers/registry";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";
import type { Prisma, ProviderConnection } from "@/lib/prisma";

function toPrismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function publicShape(row: ProviderConnection) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentialsEncrypted, ...rest } = row;
  return rest;
}

function getCatalogEntry(slug: string) {
  return CATALOG.find((e) => e.slug === slug);
}

function resolveBaseUrl(row: {
  baseUrl: string | null;
  providerType: string;
}): string {
  if (row.baseUrl) return row.baseUrl;
  const entry = CATALOG.find((e) => e.providerType === row.providerType);
  return entry?.defaultBaseUrl ?? "";
}

function buildCredentialsSchema(catalogSlug: string) {
  const entry = getCatalogEntry(catalogSlug);
  if (!entry)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `unknown catalogSlug: ${catalogSlug}`,
    });
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of entry.credFields) {
    const base = z.string();
    shape[f.key] = f.required ? base.min(1) : base.optional();
  }
  return z.object(shape).strict();
}

function buildConfigSchema(catalogSlug: string) {
  const entry = getCatalogEntry(catalogSlug);
  if (!entry)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `unknown catalogSlug: ${catalogSlug}`,
    });
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of entry.configFields) {
    const base = z.string();
    shape[f.key] = f.required ? base.min(1) : base.optional();
  }
  return z.object(shape).passthrough();
}

export const connectionRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "provider.read");
    const rows = await ctx.db.providerConnection.findMany({
      where: { orgId: ctx.session.orgId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(publicShape);
  }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.read");
      const row = await ctx.db.providerConnection.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "connection not found",
        });
      return publicShape(row);
    }),

  catalog: orgProcedure.query(async () => CATALOG),

  create: orgProcedure
    .input(
      z.object({
        catalogSlug: z.string(),
        name: z.string().min(1).max(80),
        baseUrl: z.string().url().nullable().optional(),
        credentials: z.record(z.string(), z.string()),
        config: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.write");
      const entry = getCatalogEntry(input.catalogSlug);
      if (!entry)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `unknown catalogSlug: ${input.catalogSlug}`,
        });

      buildCredentialsSchema(input.catalogSlug).parse(input.credentials);
      buildConfigSchema(input.catalogSlug).parse(input.config ?? {});

      const normalizedBaseUrl = input.baseUrl || null;
      if (normalizedBaseUrl)
        await assertSafeDestinationInput(normalizedBaseUrl);
      const finalBaseUrl = normalizedBaseUrl ?? entry.defaultBaseUrl ?? null;
      if (
        entry.baseUrlEditable &&
        !entry.defaultBaseUrl &&
        !normalizedBaseUrl
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "baseUrl is required for this catalog entry",
        });
      }

      const row = await ctx.db.providerConnection.create({
        data: {
          orgId: ctx.session.orgId,
          name: input.name,
          providerType: entry.providerType,
          baseUrl: finalBaseUrl,
          credentialsEncrypted: toPrismaBytes(encryptJson(input.credentials)),
          config: (input.config ?? {}) as Prisma.InputJsonValue,
          createdBy: ctx.session.userId,
        },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "provider.connection.create",
        resourceType: "provider_connection",
        resourceId: row.id,
        after: {
          name: row.name,
          providerType: row.providerType,
          baseUrl: row.baseUrl,
          isActive: row.isActive,
        },
      });

      return publicShape(row);
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        baseUrl: z.string().url().nullable().optional(),
        credentials: z.record(z.string(), z.string()).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.write");
      const existing = await ctx.db.providerConnection.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "connection not found",
        });

      if (input.baseUrl) await assertSafeDestinationInput(input.baseUrl);

      const data: Prisma.ProviderConnectionUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl || null;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.config !== undefined)
        data.config = input.config as Prisma.InputJsonValue;
      if (input.credentials !== undefined)
        data.credentialsEncrypted = toPrismaBytes(
          encryptJson(input.credentials),
        );

      const before = {
        name: existing.name,
        baseUrl: existing.baseUrl,
        isActive: existing.isActive,
        config: existing.config,
      };
      const row = await ctx.db.providerConnection.update({
        where: { id: input.id },
        data,
      });
      const after = {
        name: row.name,
        baseUrl: row.baseUrl,
        isActive: row.isActive,
        config: row.config,
      };

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "provider.connection.update",
        resourceType: "provider_connection",
        resourceId: row.id,
        before,
        after,
      });
      return publicShape(row);
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.delete");
      const existing = await ctx.db.providerConnection.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "connection not found",
        });
      await ctx.db.providerConnection.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "provider.connection.delete",
        resourceType: "provider_connection",
        resourceId: existing.id,
        before: { name: existing.name, providerType: existing.providerType },
      });
      return { ok: true };
    }),

  listModels: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.write");
      const row = await ctx.db.providerConnection.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "connection not found",
        });
      const creds = decryptJson<Record<string, string>>(
        row.credentialsEncrypted,
      );
      const adapter = getAdapter(row.providerType);
      const result = await adapter.listModels({
        baseUrl: resolveBaseUrl(row),
        credentials: creds,
        config: row.config as Record<string, unknown>,
        model: "list",
        messages: [],
      });
      return result;
    }),

  listModelsPreview: orgProcedure
    .input(
      z.object({
        catalogSlug: z.string(),
        baseUrl: z.string().url().optional(),
        credentials: z.record(z.string(), z.string()),
        config: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.write");
      const entry = getCatalogEntry(input.catalogSlug);
      if (!entry)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `unknown catalogSlug: ${input.catalogSlug}`,
        });
      buildCredentialsSchema(input.catalogSlug).parse(input.credentials);
      const finalBaseUrl = input.baseUrl ?? entry.defaultBaseUrl ?? "";
      if (!finalBaseUrl)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "baseUrl required",
        });
      const adapter = getAdapter(entry.providerType);
      return adapter.listModels({
        baseUrl: finalBaseUrl,
        credentials: input.credentials,
        config: input.config,
        model: "list",
        messages: [],
      });
    }),

  ping: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "provider.write");
      const row = await ctx.db.providerConnection.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "connection not found",
        });
      const creds = decryptJson<Record<string, string>>(
        row.credentialsEncrypted,
      );
      const adapter = getAdapter(row.providerType);
      const result = await adapter.ping({
        baseUrl: resolveBaseUrl(row),
        credentials: creds,
        config: row.config as Record<string, unknown>,
        model: "ping",
        messages: [],
      });
      const status = result.ok ? "ok" : `failed:${result.error ?? "unknown"}`;
      await ctx.db.providerConnection.update({
        where: { id: row.id },
        data: { lastValidatedAt: new Date(), lastValidationStatus: status },
      });
      if (!result.ok) {
        await writeAudit({
          orgId: ctx.session.orgId,
          actorId: ctx.session.userId,
          action: "provider.connection.ping",
          resourceType: "provider_connection",
          resourceId: row.id,
          after: { status, latencyMs: result.latencyMs },
        });
      }
      return { ok: result.ok, status, latencyMs: result.latencyMs };
    }),
});
