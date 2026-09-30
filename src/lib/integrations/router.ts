import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { writeAudit } from "@/lib/audit/log";
import { assertPermission } from "@/lib/rbac/check";
import { assertSafeDestinationInput } from "@/lib/egress/trpc";
import type { Prisma } from "@/lib/prisma";
import crypto from "node:crypto";

export const integrationsRouter = router({
  // List webhook endpoints
  listWebhooks: orgProcedure.query(({ ctx }) =>
    ctx.db.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } }),
  ),

  // Get a single webhook endpoint
  webhookById: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const wh = await ctx.db.webhookEndpoint.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!wh) throw new Error("Webhook not found");
      return wh;
    }),

  // Create a webhook endpoint
  createWebhook: orgProcedure
    .input(
      z.object({
        url: z.string().url(),
        events: z
          .array(z.string())
          .default(["usecase.approved", "usecase.rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      await assertSafeDestinationInput(input.url);
      const secret = "wh_" + crypto.randomBytes(20).toString("hex");
      const created = await ctx.db.webhookEndpoint.create({
        data: {
          orgId: ctx.session.orgId,
          url: input.url,
          events: input.events as Prisma.InputJsonValue,
          secret,
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "webhook.create",
        resourceType: "webhook_endpoint",
        resourceId: created.id,
        after: { url: created.url, events: input.events },
        ip: ctx.ip,
      });
      return created;
    }),

  // Update a webhook endpoint
  updateWebhook: orgProcedure
    .input(
      z.object({
        id: z.string(),
        url: z.string().url().optional(),
        events: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      if (input.url) await assertSafeDestinationInput(input.url);
      const { id, ...rest } = input;
      const updated = await ctx.db.webhookEndpoint.update({
        where: { id },
        data: rest,
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "webhook.update",
        resourceType: "webhook_endpoint",
        resourceId: id,
        after: rest,
        ip: ctx.ip,
      });
      return updated;
    }),

  // Delete a webhook endpoint
  deleteWebhook: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      await ctx.db.webhookEndpoint.delete({ where: { id: input.id } });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "webhook.delete",
        resourceType: "webhook_endpoint",
        resourceId: input.id,
        ip: ctx.ip,
      });
      return { ok: true as const };
    }),

  // Regenerate secret for a webhook endpoint (returns new secret once)
  regenerateSecret: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "integrations.write");
      const newSecret = "wh_" + crypto.randomBytes(20).toString("hex");
      const _updated = await ctx.db.webhookEndpoint.update({
        where: { id: input.id },
        data: { secret: newSecret },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "webhook.regenerate_secret",
        resourceType: "webhook_endpoint",
        resourceId: input.id,
        ip: ctx.ip,
      });
      return { secret: newSecret };
    }),
});
