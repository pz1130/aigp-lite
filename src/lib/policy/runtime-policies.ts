import { prisma } from "@/lib/db";
import { resolveEffectivePolicyOrgIds } from "./effective-org-ids";

/**
 * Load the enabled policies that the runtime must evaluate for `orgId`: the
 * org's own enabled policies plus its parent's enabled policies (two-level
 * inheritance). Rows are distinct by id, so no dedup is needed. A parent
 * policy enters the set iff the parent keeps it `enabled: true` — a child can
 * only ADD its own policies, never disable an inherited one.
 */
export async function loadRuntimePolicies(orgId: string) {
  const orgIds = await resolveEffectivePolicyOrgIds(prisma, orgId);
  return prisma.policy.findMany({
    where: { orgId: { in: orgIds }, enabled: true },
    select: {
      id: true,
      name: true,
      ruleJson: true,
      enforcementMode: true,
      scope: true,
      severity: true,
    },
  });
}
