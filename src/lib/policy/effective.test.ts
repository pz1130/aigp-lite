import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { loadEffectivePolicies } from "./effective";

async function makeOrg(parentOrgId: string | null = null) {
  return prisma.organization.create({
    data: {
      name: "EFF-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      parentOrgId,
    },
  });
}
async function makePolicy(orgId: string, name: string) {
  return prisma.policy.create({
    data: {
      orgId,
      name,
      description: "",
      ruleJson: {},
      severity: "medium",
      enforcementMode: "warn",
      scope: "both",
      enabled: true,
    },
  });
}

describe("loadEffectivePolicies", () => {
  it("top-level org: own populated, inherited empty", async () => {
    const org = await makeOrg();
    await makePolicy(org.id, "own-a");
    const res = await loadEffectivePolicies(org.id);
    expect(res.own.map((p) => p.name)).toEqual(["own-a"]);
    expect(res.inherited).toEqual([]);
  });

  it("child org: own = child rows, inherited = parent rows", async () => {
    const parent = await makeOrg();
    const child = await makeOrg(parent.id);
    await makePolicy(parent.id, "hq-1");
    await makePolicy(child.id, "child-1");
    const res = await loadEffectivePolicies(child.id);
    expect(res.own.map((p) => p.name)).toEqual(["child-1"]);
    expect(res.inherited.map((p) => p.name)).toEqual(["hq-1"]);
  });
});

import { appRouter } from "@/lib/trpc/router";

function ctxFor(orgId: string, userId: string) {
  return {
    db: prisma,
    session: { orgId, userId, email: "x@t.local", role: "admin" as const },
    ip: "127.0.0.1",
  } as const;
}

describe("policyRouter.listEffective", () => {
  it("returns own + inherited for a child org's caller", async () => {
    const parent = await makeOrg();
    const child = await makeOrg(parent.id);
    await makePolicy(parent.id, "hq-x");
    await makePolicy(child.id, "child-x");
    const caller = appRouter.createCaller(ctxFor(child.id, "u1"));
    const res = await caller.policy.listEffective();
    expect(res.own.map((p) => p.name)).toEqual(["child-x"]);
    expect(res.inherited.map((p) => p.name)).toEqual(["hq-x"]);
  });
});
