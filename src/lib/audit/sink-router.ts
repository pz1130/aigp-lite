import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit, sinkSecrets } from "./log";
import { forwardToSink, toForwardSink, type AuditPayload } from "./forward";
import { encryptJson } from "@/lib/crypto/secrets";
import {
  assertSafeDestinationInput,
  assertSafeHostInput,
} from "@/lib/egress/trpc";

/** Strip the encrypted blob before returning a sink to clients. */
function publicSink<T extends { secretsEncrypted?: unknown }>(
  sink: T,
): Omit<T, "secretsEncrypted"> {
  const { secretsEncrypted: _omit, ...rest } = sink;
  return rest;
}

const webhookInput = z.object({
  type: z.literal("webhook"),
  name: z.string().min(1).max(100),
  url: z.string().url(),
  token: z.string().optional(),
  enabled: z.boolean().default(true),
});

const syslogInput = z.object({
  type: z.literal("syslog"),
  name: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["udp", "tcp"]).default("udp"),
  enabled: z.boolean().default(true),
});

const datadogInput = z.object({
  type: z.literal("datadog"),
  name: z.string().min(1).max(100),
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().default(true),
});

const sinkCreate = z.discriminatedUnion("type", [
  webhookInput,
  syslogInput,
  datadogInput,
]);

const sinkUpdate = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional().nullable(),
  token: z.string().optional().nullable(),
  host: z.string().optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  protocol: z.enum(["udp", "tcp"]).optional(),
  apiKey: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export const auditSinkRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "audit.read");
    const sinks = await ctx.db.auditSink.findMany({
      where: { orgId: ctx.session.orgId },
      orderBy: { createdAt: "desc" },
    });
    return sinks.map(publicSink);
  }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "audit.read");
      const sink = await ctx.db.auditSink.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!sink) throw new Error("Sink not found");
      return publicSink(sink);
    }),

  create: orgProcedure.input(sinkCreate).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "audit.write");
    if (input.type === "syslog") {
      await assertSafeHostInput(input.host);
    } else if (input.url) {
      await assertSafeDestinationInput(input.url);
    }
    const token = "token" in input ? input.token : undefined;
    const apiKey = "apiKey" in input ? input.apiKey : undefined;
    const {
      token: _t,
      apiKey: _a,
      ...rest
    } = input as typeof input & {
      token?: string;
      apiKey?: string;
    };
    const sink = await ctx.db.auditSink.create({
      data: {
        ...rest,
        orgId: ctx.session.orgId,
        ...(token !== undefined || apiKey !== undefined
          ? { secretsEncrypted: Buffer.from(encryptJson({ token, apiKey })) }
          : {}),
      },
    });
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "audit.sink.create",
      resourceType: "audit_sink",
      resourceId: sink.id,
      after: { name: sink.name, type: sink.type },
    });
    return publicSink(sink);
  }),

  update: orgProcedure.input(sinkUpdate).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "audit.write");
    if (input.url) await assertSafeDestinationInput(input.url);
    if (input.host) await assertSafeHostInput(input.host);
    const { id, token, apiKey, ...rest } = input;
    const data = {
      ...rest,
      ...(token !== undefined || apiKey !== undefined
        ? {
            secretsEncrypted: Buffer.from(
              encryptJson({
                token: token ?? undefined,
                apiKey: apiKey ?? undefined,
              }),
            ),
          }
        : {}),
    };
    const before = await ctx.db.auditSink.findFirst({
      where: { id, orgId: ctx.session.orgId },
    });
    if (!before) throw new Error("Sink not found");
    const sink = await ctx.db.auditSink.update({ where: { id }, data });
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "audit.sink.update",
      resourceType: "audit_sink",
      resourceId: id,
      before: { name: before.name, type: before.type },
      after: { name: sink.name, type: sink.type },
    });
    return publicSink(sink);
  }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "audit.write");
      const sink = await ctx.db.auditSink.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!sink) throw new Error("Sink not found");
      await ctx.db.auditSink.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "audit.sink.delete",
        resourceType: "audit_sink",
        resourceId: input.id,
        before: { name: sink.name, type: sink.type },
      });
      return { ok: true as const };
    }),

  test: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "audit.write");
      const sink = await ctx.db.auditSink.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!sink) throw new Error("Sink not found");

      const testPayload: AuditPayload = {
        ts: new Date().toISOString(),
        orgId: ctx.session.orgId,
        action: "audit.sink.test",
        resourceType: "audit_sink",
        resourceId: input.id,
        after: { message: "Test event from AIGP-Lite" },
      };

      const { token, apiKey } = sinkSecrets(sink.secretsEncrypted);

      try {
        const forwardSink = toForwardSink({
          type: sink.type,
          id: sink.id,
          url: sink.url,
          token,
          host: sink.host,
          port: sink.port,
          protocol: sink.protocol,
          apiKey,
        });
        if (!forwardSink) throw new Error("Invalid sink configuration");
        await forwardToSink(forwardSink, testPayload);
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
});
