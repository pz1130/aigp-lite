import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import {
  upsertConnection,
  rotateToken,
  setEnabled,
  getRedacted,
} from "./store";

const roleValueMapSchema = z.record(z.string(), z.string());

const upsertInput = z.object({
  roleAttribute: z.string().nullish(),
  roleValueMap: roleValueMapSchema.nullish(),
  enabled: z.boolean().optional(),
});

export const scimRouter = router({
  get: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "org.write");
    return getRedacted(ctx.session.orgId);
  }),

  upsert: orgProcedure.input(upsertInput).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "org.write");

    // Enforces the "SCIM requires SSO alongside it" decision at the point of
    // configuration — SCIM never issues login credentials, so provisioning
    // without a working login path would silently orphan every synced user.
    const sso = await prisma.ssoConnection.findUnique({
      where: { orgId: ctx.session.orgId },
    });
    if (!sso || !sso.enabled) {
      throw new AppError(
        "VALIDATION",
        "SCIM requires an existing, enabled SSO connection on this org. Configure SSO on /settings/sso first.",
      );
    }

    // upsertConnection defaults `enabled` to `true` when the field is
    // omitted (`input.enabled ?? true`), which is correct for first-time
    // creation but wrong for a config-only update: an admin editing just
    // roleAttribute/roleValueMap on an already-disabled connection must not
    // have it silently re-enabled. When enabled is omitted and a connection
    // already exists, forward its current value explicitly so it's never
    // left ambiguous. On first-time create there's nothing to preserve, so
    // enabled stays unset and upsertConnection's own default applies.
    let enabled = input.enabled;
    if (enabled === undefined) {
      const existing = await prisma.scimConnection.findUnique({
        where: { orgId: ctx.session.orgId },
      });
      if (existing) {
        enabled = existing.enabled;
      }
    }

    const result = await upsertConnection(
      ctx.session.orgId,
      { ...input, enabled },
      ctx.session.userId,
    );
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "scim.connection.upsert",
      resourceType: "ScimConnection",
      resourceId: ctx.session.orgId,
      after: { roleAttribute: input.roleAttribute, enabled },
    });
    return result;
  }),

  rotateToken: orgProcedure.mutation(async ({ ctx }) => {
    assertPermission(ctx.session.role, "org.write");
    const raw = await rotateToken(ctx.session.orgId);
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "scim.token.rotated",
      resourceType: "ScimConnection",
      resourceId: ctx.session.orgId,
    });
    return { rawToken: raw };
  }),

  setEnabled: orgProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      await setEnabled(ctx.session.orgId, input.enabled);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "scim.connection.set_enabled",
        resourceType: "ScimConnection",
        resourceId: ctx.session.orgId,
        after: { enabled: input.enabled },
      });
      return { ok: true };
    }),
});
