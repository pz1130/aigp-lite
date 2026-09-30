import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { resolveEffectivePolicyOrgIds } from "./effective-org-ids";

async function makeOrg(parentOrgId: string | null = null) {
  return prisma.organization.create({
    data: {
      name: "EOI-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      parentOrgId,
    },
  });
}

describe("resolveEffectivePolicyOrgIds", () => {
  it("returns only the org itself for a top-level org", async () => {
    const org = await makeOrg();
    expect(await resolveEffectivePolicyOrgIds(prisma, org.id)).toEqual([
      org.id,
    ]);
  });

  it("returns [child, parent] for a child org", async () => {
    const parent = await makeOrg();
    const child = await makeOrg(parent.id);
    expect(await resolveEffectivePolicyOrgIds(prisma, child.id)).toEqual([
      child.id,
      parent.id,
    ]);
  });

  it("returns [org] when the org row does not exist (fail-safe)", async () => {
    expect(await resolveEffectivePolicyOrgIds(prisma, "nonexistent")).toEqual([
      "nonexistent",
    ]);
  });
});
