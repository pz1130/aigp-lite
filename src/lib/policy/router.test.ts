import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { policyRouter } from "./router";
import type { TRPCContext } from "@/lib/trpc/server";

let orgId: string;
let ownerCtx: TRPCContext;
let viewerCtx: TRPCContext;

beforeAll(async () => {
  // Global truncate runs in tests/unit-global-setup.ts; per-file cleanup
  // only matters for watch mode re-runs.
  await prisma.policyEvaluation.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "PolicyTestOrg" },
  });
  orgId = org.id;
  const hash = await hashPassword("testtest");
  const owner = await prisma.user.create({
    data: {
      email: "policy_owner@demo.local",
      name: "Owner",
      passwordHash: hash,
    },
  });
  const viewer = await prisma.user.create({
    data: {
      email: "policy_viewer@demo.local",
      name: "Viewer",
      passwordHash: hash,
    },
  });
  await prisma.membership.create({
    data: { orgId, userId: owner.id, role: "ai_owner" },
  });
  await prisma.membership.create({
    data: { orgId, userId: viewer.id, role: "viewer" },
  });
  ownerCtx = {
    session: {
      userId: owner.id,
      email: owner.email,
      orgId,
      role: "ai_owner" as const,
    },
  };
  viewerCtx = {
    session: {
      userId: viewer.id,
      email: viewer.email,
      orgId,
      role: "viewer" as const,
    },
  };
});

describe("policy.router", () => {
  it("ai_owner can create a policy", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    const p = await caller.create({
      name: "PII Detection",
      description: "Block PII in prompts",
      ruleJson: { type: "pii" },
      severity: "high",
      enforcementMode: "block",
      scope: "input",
      enabled: true,
    });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe("PII Detection");
    expect(p.severity).toBe("high");
    expect(p.enforcementMode).toBe("block");
  });

  it("list returns at least the created policy", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    const rows = await caller.list();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].orgId).toBe(orgId);
  });

  it("viewer cannot create a policy", async () => {
    const caller = policyRouter.createCaller(viewerCtx);
    await expect(
      caller.create({
        name: "Bad Policy",
        description: "",
        ruleJson: {},
        severity: "low",
        enforcementMode: "warn",
        scope: "both",
        enabled: true,
      }),
    ).rejects.toThrow(/lacks "policy\.write"/);
  });

  it("ai_owner can remove a policy", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    // Create a policy to delete
    const p = await caller.create({
      name: "To Be Deleted",
      description: "",
      ruleJson: {},
      severity: "low",
      enforcementMode: "log",
      scope: "both",
      enabled: false,
    });
    const result = await caller.remove({ id: p.id });
    expect(result.ok).toBe(true);
  });

  it("viewer cannot remove a policy", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    const p = await caller.create({
      name: "Protected",
      description: "",
      ruleJson: {},
      severity: "medium",
      enforcementMode: "warn",
      scope: "output",
      enabled: true,
    });
    const viewerCaller = policyRouter.createCaller(viewerCtx);
    await expect(viewerCaller.remove({ id: p.id })).rejects.toThrow(
      /lacks "policy\.delete"/,
    );
  });

  it("recentHits returns policy evaluation hits", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    const rows = await caller.recentHits({ limit: 10 });
    // Just verify the query runs without error and returns array
    expect(Array.isArray(rows)).toBe(true);
  });

  it("apiKeys.list returns api keys for org", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    const keys = await caller.apiKeys.list();
    expect(Array.isArray(keys)).toBe(true);
  });

  it("apiKeys.create creates a key and returns plaintext once", async () => {
    const caller = policyRouter.createCaller(ownerCtx);
    const result = await caller.apiKeys.create({ label: "runtime-key" });
    expect(result.key).toMatch(/^aigp_/);
    expect(result.prefix).toBe(result.key.slice(0, 8));
    expect(result.id).toBeTruthy();
  });

  it("viewer cannot create an api key", async () => {
    const caller = policyRouter.createCaller(viewerCtx);
    await expect(caller.apiKeys.create({ label: "bad" })).rejects.toThrow(
      /lacks "policy\.write"/,
    );
  });

  it("apiKeys.revoke deletes the key", async () => {
    const ownerCaller = policyRouter.createCaller(ownerCtx);
    const { id } = await ownerCaller.apiKeys.create({ label: "to-revoke" });
    const result = await ownerCaller.apiKeys.revoke({ id });
    expect(result.ok).toBe(true);
  });

  it("viewer cannot revoke an api key", async () => {
    const ownerCaller = policyRouter.createCaller(ownerCtx);
    const { id } = await ownerCaller.apiKeys.create({ label: "protected-key" });
    const viewerCaller = policyRouter.createCaller(viewerCtx);
    await expect(viewerCaller.apiKeys.revoke({ id })).rejects.toThrow(
      /lacks "policy\.delete"/,
    );
  });
});
