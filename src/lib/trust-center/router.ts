import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import { generateTrustToken } from "./token";
import {
  saveTrustProfile,
  createTrustDraft,
  publishTrustSnapshot,
  withdrawTrustSnapshot,
  deleteTrustDraft,
  isTrustSnapshotStale,
  TrustStateError,
} from "./service";

function translate(err: unknown): never {
  if (err instanceof TrustStateError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase letters, digits, hyphens");

const profileInput = z.object({
  slug: slugSchema,
  displayName: z.string().min(1).max(120),
  intro: z.string().max(4000).default(""),
  contactEmail: z.string().email().nullable(),
  enabled: z.boolean(),
});

export const trustCenterRouter = router({
  getProfile: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "trust-center.read");
    const profile = await prisma.trustProfile.findUnique({
      where: { orgId: ctx.session.orgId },
    });
    const latest = await prisma.trustSnapshot.findFirst({
      where: { orgId: ctx.session.orgId, status: "published" },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    });
    return {
      profile,
      latestPublishedAt: latest?.publishedAt ?? null,
      stale: isTrustSnapshotStale(latest?.publishedAt ?? null),
    };
  }),

  saveProfile: orgProcedure
    .input(profileInput)
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.write");
      const saved = await saveTrustProfile({
        orgId: ctx.session.orgId,
        ...input,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.profile.update",
        resourceType: "trust_profile",
        resourceId: saved.id,
        after: { slug: saved.slug, enabled: saved.enabled },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return saved;
    }),

  listSnapshots: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "trust-center.read");
    return prisma.trustSnapshot.findMany({
      where: { orgId: ctx.session.orgId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        version: true,
        status: true,
        includedUsecaseIds: true,
        createdAt: true,
        publishedAt: true,
        withdrawnAt: true,
      },
    });
  }),

  getSnapshot: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.read");
      const row = await prisma.trustSnapshot.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  createDraft: orgProcedure
    .input(z.object({ usecaseIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.write");
      const draft = await createTrustDraft({
        db: ctx.db,
        orgId: ctx.session.orgId,
        userId: ctx.session.userId,
        usecaseIds: input.usecaseIds,
        generatedBy: {
          id: ctx.session.userId,
          name: ctx.session.email ?? "unknown",
        },
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.snapshot.draft",
        resourceType: "trust_snapshot",
        resourceId: draft.id,
        after: { includedUsecaseIds: input.usecaseIds },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return draft;
    }),

  publish: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.approve");
      const published = await publishTrustSnapshot({
        orgId: ctx.session.orgId,
        snapshotId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.snapshot.publish",
        resourceType: "trust_snapshot",
        resourceId: published.id,
        after: { version: published.version },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return published;
    }),

  withdraw: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.approve");
      const withdrawn = await withdrawTrustSnapshot({
        orgId: ctx.session.orgId,
        snapshotId: input.id,
        userId: ctx.session.userId,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.snapshot.withdraw",
        resourceType: "trust_snapshot",
        resourceId: withdrawn.id,
        after: { version: withdrawn.version },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return withdrawn;
    }),

  deleteDraft: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.delete");
      const deleted = await deleteTrustDraft({
        orgId: ctx.session.orgId,
        snapshotId: input.id,
      }).catch(translate);
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.snapshot.delete",
        resourceType: "trust_snapshot",
        resourceId: deleted.id,
        before: { includedUsecaseIds: deleted.includedUsecaseIds },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true as const };
    }),

  listTokens: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "trust-center.read");
    return prisma.trustAccessToken.findMany({
      where: { orgId: ctx.session.orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tokenPrefix: true,
        label: true,
        recipientEmail: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        lastUsedAt: true,
        useCount: true,
      },
    });
  }),

  issueToken: orgProcedure
    .input(
      z.object({
        label: z.string().min(1).max(120),
        recipientEmail: z.string().email().nullable(),
        expiresAt: z.string().datetime().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.approve");
      const { raw, hash, prefix } = generateTrustToken();
      const token = await prisma.trustAccessToken.create({
        data: {
          orgId: ctx.session.orgId,
          tokenHash: hash,
          tokenPrefix: prefix,
          label: input.label,
          recipientEmail: input.recipientEmail,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdById: ctx.session.userId,
        },
        select: {
          id: true,
          tokenPrefix: true,
          label: true,
          recipientEmail: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          lastUsedAt: true,
          useCount: true,
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.token.issue",
        resourceType: "trust_access_token",
        resourceId: token.id,
        after: { tokenPrefix: prefix, label: input.label },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      // `raw` is returned exactly once and is never persisted or re-derivable.
      return { token, raw };
    }),

  revokeToken: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "trust-center.approve");
      const existing = await prisma.trustAccessToken.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const revoked = await prisma.trustAccessToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokedById: ctx.session.userId },
        select: {
          id: true,
          tokenPrefix: true,
          label: true,
          recipientEmail: true,
          expiresAt: true,
          revokedAt: true,
          revokedById: true,
          createdAt: true,
          lastUsedAt: true,
          useCount: true,
        },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "trust.token.revoke",
        resourceType: "trust_access_token",
        resourceId: revoked.id,
        after: { tokenPrefix: revoked.tokenPrefix, label: revoked.label },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return revoked;
    }),
});
