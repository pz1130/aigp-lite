import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import {
  upsertConnection,
  getRedacted,
  rotateSecret,
  setEnabled,
} from "./store";

// Nested groups-claim → role map, e.g. { "groups": { "admins": "admin" } }.
const groupRoleMapSchema = z.record(
  z.string(),
  z.record(z.string(), z.string()),
);

const upsertInput = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  // Required to create; omit on update to preserve the stored secret.
  clientSecret: z.string().min(1).optional(),
  buttonLabel: z.string().max(80).nullish(),
  allowedDomains: z.array(z.string()).optional(),
  groupRoleMap: groupRoleMapSchema.nullish(),
  enabled: z.boolean().optional(),
});

/**
 * Admin self-service for the org's SSO/OIDC connection. Gated on `org.write`
 * (admin only). The client secret is write-only: it never crosses the server
 * boundary back to the client — reads return a redacted view.
 */
export const ssoRouter = router({
  get: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "org.write");
    return getRedacted(ctx.session.orgId);
  }),

  upsert: orgProcedure.input(upsertInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "org.write");
    await upsertConnection(
      ctx.session.orgId,
      {
        issuer: input.issuer,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        buttonLabel: input.buttonLabel ?? null,
        allowedDomains: input.allowedDomains,
        groupRoleMap: input.groupRoleMap ?? null,
        enabled: input.enabled,
      },
      ctx.session.userId,
    );
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "sso.connection.upsert",
      resourceType: "SsoConnection",
      resourceId: ctx.session.orgId,
      // Never log the secret.
      after: {
        issuer: input.issuer,
        clientId: input.clientId,
        enabled: input.enabled ?? true,
      },
    });
    return getRedacted(ctx.session.orgId);
  }),

  rotateSecret: orgProcedure
    .input(z.object({ clientSecret: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      await rotateSecret(ctx.session.orgId, input.clientSecret);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "sso.connection.rotate_secret",
        resourceType: "SsoConnection",
        resourceId: ctx.session.orgId,
      });
      return { ok: true as const };
    }),

  setEnabled: orgProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      await setEnabled(ctx.session.orgId, input.enabled);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "sso.connection.set_enabled",
        resourceType: "SsoConnection",
        resourceId: ctx.session.orgId,
        after: { enabled: input.enabled },
      });
      return { ok: true as const };
    }),
});
