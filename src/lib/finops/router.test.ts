// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { finopsRouter } from "./router";
import type { TRPCContext } from "@/lib/trpc/server";

const ORG_A = "finops-test-A";
const ORG_B = "finops-test-B";

let ctxA: TRPCContext;
let ctxB: TRPCContext;
let userA: { id: string; email: string };
let userB: { id: string; email: string };

beforeAll(async () => {
  const pwdHash = await hashPassword("testtest");
  const uA = await prisma.user.upsert({
    where: { email: "finops-a@test" },
    update: {},
    create: { email: "finops-a@test", name: "A", passwordHash: pwdHash },
  });
  const uB = await prisma.user.upsert({
    where: { email: "finops-b@test" },
    update: {},
    create: { email: "finops-b@test", name: "B", passwordHash: pwdHash },
  });
  userA = uA;
  userB = uB;
  await prisma.organization.upsert({
    where: { id: ORG_A },
    update: {},
    create: { id: ORG_A, name: "FinOps A" },
  });
  await prisma.organization.upsert({
    where: { id: ORG_B },
    update: {},
    create: { id: ORG_B, name: "FinOps B" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uA.id } },
    update: {},
    create: { orgId: ORG_A, userId: uA.id, role: "admin" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_B, userId: uB.id } },
    update: {},
    create: { orgId: ORG_B, userId: uB.id, role: "admin" },
  });
  ctxA = {
    session: {
      userId: uA.id,
      email: uA.email,
      orgId: ORG_A,
      role: "admin" as const,
    },
  };
  ctxB = {
    session: {
      userId: uB.id,
      email: uB.email,
      orgId: ORG_B,
      role: "admin" as const,
    },
  };
});

afterAll(async () => {
  await prisma.budget.deleteMany({ where: { orgId: { in: [ORG_A, ORG_B] } } });
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_A, ORG_B] } },
  });
});

describe("finops.budget.create", () => {
  beforeEach(async () => {
    await prisma.budget.deleteMany({ where: { orgId: ORG_A } });
    await prisma.auditLog.deleteMany({ where: { orgId: ORG_A } });
  });

  it("creates org-wide budget", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const result = await caller.budget.create({
      scope: "org",
      period: "monthly",
      amountUsd: 100,
      hardCap: false,
    });
    expect(result.orgId).toBe(ORG_A);
    expect(result.scope).toBe("org");
    expect(result.scopeRefId).toBeNull();
    expect(Number(result.amountUsd)).toBeCloseTo(100);
  });

  it("creates api_key-scoped budget with scopeRefId", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const result = await caller.budget.create({
      scope: "api_key",
      scopeRefId: "key-1",
      period: "monthly",
      amountUsd: 50,
      hardCap: false,
    });
    expect(result.scope).toBe("api_key");
    expect(result.scopeRefId).toBe("key-1");
  });

  it("requires scopeRefId for non-org budgets", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    await expect(
      caller.budget.create({
        scope: "usecase",
        period: "monthly",
        amountUsd: 25,
        hardCap: false,
        // scopeRefId omitted intentionally
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("finops.budget.update", () => {
  beforeEach(async () => {
    await prisma.budget.deleteMany({
      where: { orgId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.auditLog.deleteMany({
      where: { orgId: { in: [ORG_A, ORG_B] } },
    });
  });

  it("updates amountUsd and hardCap", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const created = await caller.budget.create({
      scope: "org",
      period: "monthly",
      amountUsd: 100,
      hardCap: false,
    });
    const updated = await caller.budget.update({
      id: created.id,
      amountUsd: 200,
      hardCap: true,
    });
    expect(Number(updated.amountUsd)).toBeCloseTo(200);
    expect(updated.hardCap).toBe(true);
  });

  it("rejects cross-tenant update", async () => {
    const callerA = finopsRouter.createCaller(ctxA);
    const callerB = finopsRouter.createCaller(ctxB);
    const created = await callerA.budget.create({
      scope: "org",
      period: "monthly",
      amountUsd: 100,
      hardCap: false,
    });
    await expect(
      callerB.budget.update({ id: created.id, amountUsd: 50 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("finops.budget.delete", () => {
  beforeEach(async () => {
    await prisma.budget.deleteMany({
      where: { orgId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.auditLog.deleteMany({
      where: { orgId: { in: [ORG_A, ORG_B] } },
    });
  });

  it("deletes own budget", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const created = await caller.budget.create({
      scope: "org",
      period: "monthly",
      amountUsd: 100,
      hardCap: false,
    });
    const result = await caller.budget.delete({ id: created.id });
    expect(result).toEqual({ ok: true });
  });

  it("rejects cross-tenant delete", async () => {
    const callerA = finopsRouter.createCaller(ctxA);
    const callerB = finopsRouter.createCaller(ctxB);
    const created = await callerA.budget.create({
      scope: "org",
      period: "monthly",
      amountUsd: 100,
      hardCap: false,
    });
    await expect(
      callerB.budget.delete({ id: created.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("finops.pricing.catalog", () => {
  it("returns builtIn and overrides", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const result = await caller.pricing.catalog();
    expect(result).toHaveProperty("builtIn");
    expect(result).toHaveProperty("connections");
    expect(Array.isArray(result.connections)).toBe(true);
    expect(result.builtIn.openai).toBeDefined();
    expect(result.builtIn.openai["gpt-4o-mini"]).toBeDefined();
    expect(
      result.builtIn.openai["gpt-4o-mini"].inputPerMillion,
    ).toBeGreaterThan(0);
  });

  it("builtIn has at least 20 model entries across all providers", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const result = await caller.pricing.catalog();
    const all = Object.values(result.builtIn).flatMap((p) => Object.keys(p));
    expect(all.length).toBeGreaterThanOrEqual(20);
  });
});

describe("finops.cost.totals", () => {
  it("returns zero totals when no invocations", async () => {
    const caller = finopsRouter.createCaller(ctxA);
    const result = await caller.cost.totals({
      period: { start: new Date("2026-01-01"), end: new Date("2026-12-31") },
    });
    expect(result.totalCost).toBeCloseTo(0);
    expect(result.totalInvocations).toBe(0);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
