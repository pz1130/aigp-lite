import { z } from "zod";
import { router, orgProcedure, publicProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { TRPCError } from "@trpc/server";
import {
  mintInviteToken,
  hashInviteToken,
  computeInviteExpiry,
} from "./invite-token";
import { emailTransport } from "@/lib/notification/email";
import { hashPassword } from "@/lib/auth/password";
import { prisma as rootPrisma } from "@/lib/db";

const roleEnum = z.enum([
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
]);

export const membersRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "org.read");

    return ctx.db.membership.findMany({
      where: { orgId: ctx.session.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    });
  }),

  updateRole: orgProcedure
    .input(z.object({ userId: z.string(), role: roleEnum }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");

      if (input.userId === ctx.session.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot change your own role",
        });
      }

      const existing = await ctx.db.membership.findUnique({
        where: {
          orgId_userId: { orgId: ctx.session.orgId, userId: input.userId },
        },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updated = await ctx.db.membership.update({
        where: {
          orgId_userId: { orgId: ctx.session.orgId, userId: input.userId },
        },
        data: { role: input.role },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "member.role_change",
        resourceType: "membership",
        resourceId: input.userId,
        before: { role: existing.role },
        after: { role: input.role },
        ip: ctx.ip,
      });

      return updated;
    }),

  invite: orgProcedure
    .input(z.object({ email: z.string().email(), role: roleEnum }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      const email = input.email.toLowerCase();

      // Reject if the email already belongs to a member.
      const existingUser = await ctx.db.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        const m = await ctx.db.membership.findUnique({
          where: {
            orgId_userId: { orgId: ctx.session.orgId, userId: existingUser.id },
          },
        });
        if (m) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Already a member of this org",
          });
        }
      }

      // Reject if a pending, non-expired invite already exists.
      const pending = await ctx.db.orgInvite.findFirst({
        where: { orgId: ctx.session.orgId, email, status: "pending" },
      });
      if (pending && pending.expiresAt > new Date()) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A pending invite already exists for this email",
        });
      }

      const raw = mintInviteToken();
      const invite = await ctx.db.orgInvite.create({
        data: {
          orgId: ctx.session.orgId,
          email,
          role: input.role,
          tokenHash: hashInviteToken(raw),
          expiresAt: computeInviteExpiry(),
          createdById: ctx.session.userId,
        },
      });

      const url = `${process.env.NEXTAUTH_URL ?? ""}/accept-invite?token=${encodeURIComponent(raw)}`;
      await emailTransport.sendByEmail(
        email,
        "You've been invited to AIGP-Lite",
        `You've been invited as ${input.role}. Accept the invite: ${url}\n\nThis link expires on ${invite.expiresAt.toISOString().slice(0, 10)}.`,
      );

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "member.invite",
        resourceType: "org_invite",
        resourceId: invite.id,
        after: { email, role: input.role },
        ip: ctx.ip,
      });

      return { id: invite.id };
    }),

  listInvites: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "org.read");
    const rows = await ctx.db.orgInvite.findMany({
      where: { orgId: ctx.session.orgId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      expired: r.expiresAt.getTime() < now,
    }));
  }),

  revokeInvite: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      const row = await ctx.db.orgInvite.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite is not pending",
        });
      }
      await ctx.db.orgInvite.update({
        where: { id: row.id },
        data: { status: "revoked" },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "member.invite_revoke",
        resourceType: "org_invite",
        resourceId: row.id,
        before: { status: "pending" },
        after: { status: "revoked" },
        ip: ctx.ip,
      });
      return { id: row.id };
    }),

  acceptInvite: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        password: z.string().min(8).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tokenHash = hashInviteToken(input.token);
      const invite = await rootPrisma.orgInvite.findUnique({
        where: { tokenHash },
      });
      if (!invite)
        throw new TRPCError({ code: "NOT_FOUND", message: "invalid" });
      if (invite.status === "revoked")
        throw new TRPCError({ code: "BAD_REQUEST", message: "revoked" });
      if (invite.status === "accepted")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "already_accepted",
        });
      if (invite.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "expired" });
      }

      // Logged-in branch.
      const session = (
        ctx as { session?: { userId: string; email: string } | null }
      ).session;
      if (session) {
        if (session.email.toLowerCase() !== invite.email.toLowerCase()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "email_mismatch" });
        }
        await rootPrisma.$transaction([
          rootPrisma.membership.upsert({
            where: {
              orgId_userId: { orgId: invite.orgId, userId: session.userId },
            },
            create: {
              orgId: invite.orgId,
              userId: session.userId,
              role: invite.role,
            },
            update: { role: invite.role },
          }),
          rootPrisma.orgInvite.update({
            where: { id: invite.id },
            data: {
              status: "accepted",
              acceptedAt: new Date(),
              acceptedByUserId: session.userId,
            },
          }),
        ]);
        await writeAudit({
          orgId: invite.orgId,
          actorId: session.userId,
          action: "member.accept",
          resourceType: "org_invite",
          resourceId: invite.id,
          ip: ctx.ip,
        });
        return { added: true as const };
      }

      // Anonymous branch.
      const existingUser = await rootPrisma.user.findUnique({
        where: { email: invite.email },
      });
      const ssoDomains = (process.env.SSO_OIDC_ALLOWED_DOMAINS ?? "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const emailDomain = invite.email.split("@")[1]?.toLowerCase() ?? "";
      const ssoMatch = ssoDomains.includes(emailDomain);

      if (existingUser) {
        if (!existingUser.passwordHash && existingUser.oidcSubject) {
          return { next: "sso" as const };
        }
        return { next: "sign_in" as const };
      }

      if (input.password) {
        const newUser = await rootPrisma.user.create({
          data: {
            email: invite.email,
            name: null,
            passwordHash: await hashPassword(input.password),
          },
        });
        await rootPrisma.$transaction([
          rootPrisma.membership.create({
            data: {
              orgId: invite.orgId,
              userId: newUser.id,
              role: invite.role,
            },
          }),
          rootPrisma.orgInvite.update({
            where: { id: invite.id },
            data: {
              status: "accepted",
              acceptedAt: new Date(),
              acceptedByUserId: newUser.id,
            },
          }),
        ]);
        await writeAudit({
          orgId: invite.orgId,
          actorId: newUser.id,
          action: "member.accept",
          resourceType: "org_invite",
          resourceId: invite.id,
          ip: ctx.ip,
        });
        return { added: true as const, signInRequired: true as const };
      }

      return { next: ssoMatch ? ("sso" as const) : ("set_password" as const) };
    }),

  remove: orgProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.delete");

      if (input.userId === ctx.session.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove yourself",
        });
      }

      const target = await ctx.db.membership.findUnique({
        where: {
          orgId_userId: { orgId: ctx.session.orgId, userId: input.userId },
        },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      if (target.role === "admin") {
        const adminCount = await ctx.db.membership.count({
          where: { orgId: ctx.session.orgId, role: "admin" },
        });
        if (adminCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last admin",
          });
        }
      }

      await ctx.db.membership.delete({
        where: {
          orgId_userId: { orgId: ctx.session.orgId, userId: input.userId },
        },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "member.remove",
        resourceType: "membership",
        resourceId: input.userId,
        before: { role: target.role },
        ip: ctx.ip,
      });

      return { removed: true };
    }),
});
