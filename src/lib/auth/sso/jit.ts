import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import {
  getSsoConfig,
  isEmailAllowed,
  resolveRoleFromGroups,
  __setBootDisabled,
  type SsoConfig,
} from "./config";

export type ProvisionInput = {
  sub: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  /** Raw OIDC profile claims, used for groups→role mapping when the connection defines one. */
  claims?: Record<string, unknown>;
};

export type ProvisionRejectReason =
  | "email_unverified"
  | "domain_not_allowed"
  | "org_missing"
  | "subject_conflict"
  | "provision_failed";

export type ProvisionResult =
  | { ok: true; userId: string; firstTime: boolean; linked: boolean }
  | { ok: false; reason: ProvisionRejectReason };

export async function provisionOidcUser(
  input: ProvisionInput,
  cfg: SsoConfig = getSsoConfig(),
): Promise<ProvisionResult> {
  const email = input.email.toLowerCase().trim();

  if (!email || !input.emailVerified) {
    return reject("email_unverified", {
      sub: input.sub,
      email,
      orgId: cfg.orgId,
    });
  }

  if (!isEmailAllowed(email, cfg.allowedDomains)) {
    return reject("domain_not_allowed", {
      sub: input.sub,
      email,
      orgId: cfg.orgId,
    });
  }

  const org = await prisma.organization.findUnique({
    where: { id: cfg.orgId },
  });
  if (!org) {
    __setBootDisabled(true);
    return reject("org_missing", { sub: input.sub, email, orgId: cfg.orgId });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Look up by OIDC subject first, then by email
      const byOidc = await tx.user.findUnique({
        where: { oidcSubject: input.sub },
      });
      const byEmail = !byOidc
        ? await tx.user.findUnique({ where: { email } })
        : null;

      // Capture flags before any mutation
      const preExistedAsCredentials = !!(
        byEmail && byEmail.passwordHash !== null
      );
      const brandNew = !byOidc && !byEmail;

      let user = byOidc;

      if (!user) {
        if (byEmail) {
          // Email exists — check for subject conflict
          if (byEmail.oidcSubject && byEmail.oidcSubject !== input.sub) {
            return { conflict: true as const };
          }
          // Link: attach OIDC subject to existing credentials user
          user = await tx.user.update({
            where: { id: byEmail.id },
            data: {
              oidcSubject: input.sub,
              name: byEmail.name ?? input.name ?? null,
            },
          });
        } else {
          // Brand new user
          user = await tx.user.create({
            data: {
              email,
              name: input.name,
              oidcSubject: input.sub,
              passwordHash: null,
            },
          });
        }
      } else if (user.email !== email) {
        // Returning SSO user with changed email
        user = await tx.user.update({
          where: { id: user.id },
          data: { email },
        });
      }

      // Ensure membership in the target org
      const existingMembership = await tx.membership.findUnique({
        where: { orgId_userId: { orgId: cfg.orgId, userId: user.id } },
      });
      if (!existingMembership) {
        // Map IdP group claims → role when the connection defines a mapping; default viewer.
        const role =
          resolveRoleFromGroups(cfg.groupRoleMap, input.claims ?? {}) ??
          "viewer";
        await tx.membership.create({
          data: { orgId: cfg.orgId, userId: user.id, role },
        });
      }

      return {
        conflict: false as const,
        userId: user.id,
        firstTime: brandNew && !preExistedAsCredentials,
        linked: preExistedAsCredentials,
      };
    });

    if ("conflict" in result && result.conflict) {
      return reject("subject_conflict", {
        sub: input.sub,
        email,
        orgId: cfg.orgId,
      });
    }
    if (result.conflict === false) {
      await writeAudit({
        orgId: cfg.orgId,
        actorId: result.userId,
        action: "auth.sso.login",
        resourceType: "User",
        resourceId: result.userId,
        after: {
          sub: input.sub,
          email,
          orgId: cfg.orgId,
          firstTime: result.firstTime,
          linked: result.linked,
        },
      });
      return {
        ok: true,
        userId: result.userId,
        firstTime: result.firstTime,
        linked: result.linked,
      };
    }
    // unreachable
    return reject("provision_failed", {
      sub: input.sub,
      email,
      orgId: cfg.orgId,
    });
  } catch (err) {
    return reject("provision_failed", {
      sub: input.sub,
      email,
      orgId: cfg.orgId,
      err: String((err as Error).message ?? err).slice(0, 280),
    });
  }
}

async function reject(
  reason: ProvisionRejectReason,
  metadata: Record<string, unknown>,
): Promise<ProvisionResult> {
  await writeAudit({
    orgId: (metadata.orgId as string) || "unknown",
    action: "auth.sso.rejected",
    resourceType: "User",
    after: { ...metadata, reason },
  });
  return { ok: false, reason };
}
