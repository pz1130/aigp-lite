import { prisma } from "@/lib/db";
import type { Policy } from "@/lib/prisma";
import { resolveEffectivePolicyOrgIds } from "./effective-org-ids";

/**
 * The policies to show `orgId` in the policy list, split into `own` (this
 * org's rows, editable) and `inherited` (its parent HQ's rows, read-only).
 * `inherited` is empty for a top-level org. Both are full `Policy` rows read
 * with an explicit orgId filter; the read-only guarantee is enforced by the
 * write paths (create/update/remove go through the org-scoped `ctx.db`, which
 * can never touch a parent's rows), not by this read.
 */
export async function loadEffectivePolicies(
  orgId: string,
): Promise<{ own: Policy[]; inherited: Policy[] }> {
  const orgIds = await resolveEffectivePolicyOrgIds(prisma, orgId);
  const parentId = orgIds.find((id) => id !== orgId);
  const [own, inherited] = await Promise.all([
    prisma.policy.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    }),
    parentId
      ? prisma.policy.findMany({
          where: { orgId: parentId },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  return { own, inherited };
}
