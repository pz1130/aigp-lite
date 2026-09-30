import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { resolveRoleFromScimAttribute, type RoleValueMap } from "./config";

export type ScimUserInput = {
  email: string;
  name: string | null;
  active: boolean;
  /** Raw SCIM payload, used for role-attribute mapping. */
  raw: Record<string, unknown>;
};

export type ScimConnectionConfig = {
  orgId: string;
  roleAttribute: string | null;
  roleValueMap: RoleValueMap | null;
};

export type ProvisionScimResult = {
  userId: string;
  firstTime: boolean;
};

/**
 * Provision (create-or-attach) a Membership for a SCIM-pushed user. Mirrors
 * provisionOidcUser's find-by-email step, but never sets oidcSubject — that
 * still happens on the user's first real SSO login (src/lib/auth/sso/jit.ts).
 * Idempotent: re-provisioning an already-member user only updates their role.
 */
export async function provisionScimUser(
  input: ScimUserInput,
  cfg: ScimConnectionConfig,
): Promise<ProvisionScimResult> {
  const email = input.email.toLowerCase().trim();
  const role = resolveRoleFromScimAttribute(
    input.raw,
    cfg.roleAttribute,
    cfg.roleValueMap,
  );

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    const firstTime = !user;
    if (!user) {
      user = await tx.user.create({
        data: { email, name: input.name, passwordHash: null },
      });
    }

    const existingMembership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId: cfg.orgId, userId: user.id } },
    });
    if (!existingMembership) {
      await tx.membership.create({
        data: { orgId: cfg.orgId, userId: user.id, role },
      });
    } else if (existingMembership.role !== role) {
      await tx.membership.update({
        where: { orgId_userId: { orgId: cfg.orgId, userId: user.id } },
        data: { role },
      });
    }

    return { userId: user.id, firstTime };
  });

  await writeAudit({
    orgId: cfg.orgId,
    actorId: result.userId,
    action: "scim.user.provisioned",
    resourceType: "User",
    resourceId: result.userId,
    after: { email, role, firstTime: result.firstTime, active: input.active },
  });

  return result;
}

/**
 * Deprovision: remove ONLY the Membership row for this org. The User row is
 * never deleted — they may still belong to other orgs, or be re-added later.
 * Idempotent: a no-op if the membership is already gone.
 */
export async function deprovisionScimUser(
  userId: string,
  orgId: string,
): Promise<void> {
  const existing = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!existing) return;

  await prisma.membership.delete({
    where: { orgId_userId: { orgId, userId } },
  });

  await writeAudit({
    orgId,
    actorId: userId,
    action: "scim.user.deprovisioned",
    resourceType: "User",
    resourceId: userId,
  });
}
