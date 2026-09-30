import { prisma } from "@/lib/db";
import { Role } from "@/lib/prisma";
import { MATRIX, ROLES, type Permission } from "@/lib/rbac/roles";

const VALID_ROLES = new Set<string>(Object.values(Role));

export async function fanoutRecipients(
  orgId: string,
  assigneeUserId?: string | null,
  assigneeRole?: string | null,
): Promise<string[]> {
  if (assigneeUserId) return [assigneeUserId];
  if (!assigneeRole) return [];
  if (!VALID_ROLES.has(assigneeRole)) {
    console.warn(
      `[notification] invalid assigneeRole=${assigneeRole}, skipping fanout`,
    );
    return [];
  }
  const memberships = await prisma.membership.findMany({
    where: { orgId, role: assigneeRole as Role },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
}

export async function fanoutByPermission(
  orgId: string,
  permission: Permission,
): Promise<string[]> {
  const roles = ROLES.filter((r) => MATRIX[r].has(permission));
  if (roles.length === 0) return [];
  const memberships = await prisma.membership.findMany({
    where: { orgId, role: { in: roles as Role[] } },
    select: { userId: true },
  });
  return [...new Set(memberships.map((m) => m.userId))];
}
