import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { loadRuntimePolicies } from "./runtime-policies";

async function makeOrg(parentOrgId: string | null = null) {
  return prisma.organization.create({
    data: {
      name: "RTP-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      parentOrgId,
    },
  });
}
async function makePolicy(orgId: string, name: string, enabled = true) {
  return prisma.policy.create({
    data: {
      orgId,
      name,
      description: "",
      ruleJson: { kind: "keyword", keywords: [name] },
      severity: "high",
      enforcementMode: "block",
      scope: "both",
      enabled,
    },
  });
}

describe("loadRuntimePolicies", () => {
  it("returns only own enabled policies for a top-level org", async () => {
    const org = await makeOrg();
    await makePolicy(org.id, "own-enabled");
    await makePolicy(org.id, "own-disabled", false);
    const names = (await loadRuntimePolicies(org.id)).map((p) => p.name).sort();
    expect(names).toEqual(["own-enabled"]);
  });

  it("unions the child's own enabled policies with the parent's enabled ones", async () => {
    const parent = await makeOrg();
    const child = await makeOrg(parent.id);
    await makePolicy(parent.id, "hq-baseline");
    await makePolicy(parent.id, "hq-disabled", false);
    await makePolicy(child.id, "child-strict");
    const names = (await loadRuntimePolicies(child.id))
      .map((p) => p.name)
      .sort();
    expect(names).toEqual(["child-strict", "hq-baseline"]);
  });

  it("returns the runtime select shape", async () => {
    const org = await makeOrg();
    await makePolicy(org.id, "shape-check");
    const [p] = await loadRuntimePolicies(org.id);
    expect(Object.keys(p).sort()).toEqual(
      ["enforcementMode", "id", "name", "ruleJson", "scope", "severity"].sort(),
    );
  });
});
