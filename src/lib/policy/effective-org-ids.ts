import type { PrismaClient } from "@/lib/prisma";

/**
 * Org-ids whose enabled policies make up the effective runtime policy set for
 * `orgId`: the org itself, plus its parent if it has one. Two-level tree, so
 * this returns 1 or 2 ids and never recurses. Fail-safe: if the org row is
 * missing, returns just [orgId] (no inheritance) rather than throwing.
 */
export async function resolveEffectivePolicyOrgIds(
  prisma: PrismaClient,
  orgId: string,
): Promise<string[]> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { parentOrgId: true },
  });
  return org?.parentOrgId ? [orgId, org.parentOrgId] : [orgId];
}
