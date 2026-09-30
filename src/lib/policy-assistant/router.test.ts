import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";
import * as orchestrator from "./orchestrator";

const validResult: orchestrator.GeneratePolicyReturn = {
  generationId: "gen-1",
  status: "ok",
  retryCount: 0,
  output: {
    name: "X",
    description: "Y",
    ruleJson: { regex_match: [{ var: ["text"] }, "x"] },
    severity: "high",
    enforcementMode: "block",
    scope: "input",
    tests: [
      { text: "x", shouldHit: true, reason: "p" },
      { text: "y", shouldHit: false, reason: "n" },
      { text: "xx", shouldHit: true, reason: "e" },
    ],
    status: "ok",
  },
};

let orgId: string;
let otherOrgId: string;
let userId: string;

function makeCtx(uid: string, oid: string): TRPCContext {
  return {
    session: {
      userId: uid,
      orgId: oid,
      role: "admin",
      email: `${uid}@x`,
    },
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `R ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `R2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const u = await prisma.user.create({
    data: { email: `r-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId, role: "admin" },
      { orgId: otherOrgId, userId, role: "admin" },
    ],
  });
});

afterAll(async () => {
  await prisma.policyAssistantGeneration.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

beforeEach(async () => {
  await prisma.policyAssistantGeneration.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  vi.restoreAllMocks();
  delete process.env.AIGP_ASSISTANT_DAILY_LIMIT;
});

describe("isEnabled", () => {
  it("reflects env", async () => {
    process.env.AIGP_ASSISTANT_ENABLED = "false";
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.policyAssistant.isEnabled()).toEqual({
      enabled: false,
    });
    process.env.AIGP_ASSISTANT_ENABLED = "true";
    expect(await caller.policyAssistant.isEnabled()).toEqual({ enabled: true });
  });
});

describe("usageToday", () => {
  it("counts only this org today", async () => {
    process.env.AIGP_ASSISTANT_ENABLED = "true";
    await prisma.policyAssistantGeneration.createMany({
      data: [
        {
          orgId,
          userId,
          description: "a",
          status: "ok",
          outputJson: {},
          providerType: "x",
          model: "x",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
        {
          orgId,
          userId,
          description: "b",
          status: "ok",
          outputJson: {},
          providerType: "x",
          model: "x",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
        {
          orgId: otherOrgId,
          userId,
          description: "c",
          status: "ok",
          outputJson: {},
          providerType: "x",
          model: "x",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
      ],
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.policyAssistant.usageToday();
    expect(r.used).toBe(2);
    expect(r.limit).toBe(20);
  });
});

describe("generate", () => {
  it("throws PRECONDITION_FAILED when disabled", async () => {
    process.env.AIGP_ASSISTANT_ENABLED = "false";
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.policyAssistant.generate({ description: "describe me please" }),
    ).rejects.toThrow(/disabled|PRECONDITION/);
  });

  it("throws TOO_MANY_REQUESTS when over quota", async () => {
    process.env.AIGP_ASSISTANT_ENABLED = "true";
    process.env.AIGP_ASSISTANT_DAILY_LIMIT = "2";
    await prisma.policyAssistantGeneration.createMany({
      data: [
        {
          orgId,
          userId,
          description: "a",
          status: "ok",
          outputJson: {},
          providerType: "x",
          model: "x",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
        {
          orgId,
          userId,
          description: "b",
          status: "ok",
          outputJson: {},
          providerType: "x",
          model: "x",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        },
      ],
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.policyAssistant.generate({ description: "describe me please" }),
    ).rejects.toThrow(/quota|TOO_MANY/);
  });

  it("success returns output and writes audit row", async () => {
    process.env.AIGP_ASSISTANT_ENABLED = "true";
    vi.spyOn(orchestrator, "generatePolicy").mockResolvedValue(validResult);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.policyAssistant.generate({
      description: "describe me please",
    });
    expect(r.name).toBe("X");
    const audit = await prisma.auditLog.findFirst({
      where: {
        orgId,
        action: "policy_assistant.generate",
        resourceId: "gen-1",
      },
    });
    expect(audit).not.toBeNull();
  });

  it("org isolation: A's generations do not affect B's quota", async () => {
    process.env.AIGP_ASSISTANT_ENABLED = "true";
    process.env.AIGP_ASSISTANT_DAILY_LIMIT = "1";
    await prisma.policyAssistantGeneration.create({
      data: {
        orgId: otherOrgId,
        userId,
        description: "a",
        status: "ok",
        outputJson: {},
        providerType: "x",
        model: "x",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
      },
    });
    vi.spyOn(orchestrator, "generatePolicy").mockResolvedValue(validResult);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.policyAssistant.generate({ description: "describe me please" }),
    ).resolves.toBeDefined();
  });
});
