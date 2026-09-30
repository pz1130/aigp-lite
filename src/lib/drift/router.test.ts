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

vi.mock("./config", () => ({
  isDriftEnabled: () => true,
  getJudgeProvider: () => ({
    kind: "anthropic",
    apiKey: "sk-test",
    model: "claude-haiku-4-5-20251001",
  }),
}));

vi.mock("@/lib/runtime/providers/registry", () => ({
  getAdapter: () => ({
    streamChat: vi.fn().mockImplementation(async function* () {
      yield {
        delta: JSON.stringify({ score: 8, judgment: "Good" }),
        usage: { input: 50, output: 30 },
      };
    }),
  }),
}));

// There is no BullMQ worker in the test process. When Redis is available the
// real enqueueJob hands the job to the queue and returns, so nothing would ever
// process it and the run would stay "pending". Mock enqueueJob to run the drift
// processor inline — same effect as the no-Redis inline path — so startRun's
// downstream work actually executes regardless of whether Redis is up.
vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueJob: async (name: string, data: { runId: string }) => {
    if (name === "drift.run") {
      const { runBenchmark } = await import("@/lib/drift/runner");
      await runBenchmark(data.runId);
    }
  },
}));

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
    data: { name: `Drift ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `Drift2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const u = await prisma.user.create({
    data: { email: `drift-${Date.now()}@x`, name: "U", passwordHash: "x" },
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
  await prisma.driftResult.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.driftRun.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.driftPrompt.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.driftBenchmark.deleteMany({
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
  await prisma.driftResult.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.driftRun.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.driftPrompt.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.driftBenchmark.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
});

describe("drift.create", () => {
  it("creates benchmark with prompts", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.create({
      name: "Test Benchmark",
      threshold: 7.5,
      prompts: [
        { promptText: "What is 2+2?", expectedBehavior: "Should answer 4" },
        {
          promptText: "Capital of France?",
          expectedBehavior: "Should answer Paris",
        },
      ],
    });
    expect(r.name).toBe("Test Benchmark");
    expect(r.threshold).toBe(7.5);
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[0].sortOrder).toBe(0);
    expect(r.prompts[1].sortOrder).toBe(1);
  });
});

describe("drift.list", () => {
  it("returns benchmarks for org only", async () => {
    await prisma.driftBenchmark.create({
      data: { orgId, name: "A", createdById: userId },
    });
    await prisma.driftBenchmark.create({
      data: { orgId: otherOrgId, name: "B", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.list();
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("A");
  });
});

describe("drift.byId", () => {
  it("returns benchmark with prompts and runs", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: {
        orgId,
        name: "B",
        createdById: userId,
        prompts: {
          create: [
            { orgId, sortOrder: 0, promptText: "Q1", expectedBehavior: "A1" },
          ],
        },
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.byId({ id: bench.id });
    expect(r!.name).toBe("B");
    expect(r!.prompts).toHaveLength(1);
  });

  it("returns null for wrong org", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: { orgId: otherOrgId, name: "Other", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.byId({ id: bench.id });
    expect(r).toBeNull();
  });
});

describe("drift.update", () => {
  it("updates benchmark fields", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: { orgId, name: "Old", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.update({
      id: bench.id,
      name: "New",
      threshold: 8.0,
    });
    expect(r.name).toBe("New");
    expect(r.threshold).toBe(8.0);
  });

  it("replaces prompts when array provided", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: {
        orgId,
        name: "B",
        createdById: userId,
        prompts: {
          create: [
            { orgId, sortOrder: 0, promptText: "old", expectedBehavior: "old" },
          ],
        },
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.update({
      id: bench.id,
      prompts: [
        { promptText: "new1", expectedBehavior: "a1" },
        { promptText: "new2", expectedBehavior: "a2" },
      ],
    });
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[0].promptText).toBe("new1");
  });

  it("throws for wrong org", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: { orgId: otherOrgId, name: "Other", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.drift.update({ id: bench.id, name: "X" }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("drift.remove", () => {
  it("deletes benchmark and cascades", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: {
        orgId,
        name: "Del",
        createdById: userId,
        prompts: {
          create: [
            { orgId, sortOrder: 0, promptText: "Q", expectedBehavior: "A" },
          ],
        },
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.drift.remove({ id: bench.id });
    const found = await prisma.driftBenchmark.findUnique({
      where: { id: bench.id },
    });
    expect(found).toBeNull();
  });
});

describe("drift.startRun", () => {
  it("creates a run and completes it", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: {
        orgId,
        name: "Run Test",
        threshold: 7.0,
        createdById: userId,
        prompts: {
          create: [
            { orgId, sortOrder: 0, promptText: "Q1", expectedBehavior: "A1" },
          ],
        },
      },
    });

    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const run = await caller.drift.startRun({
      benchmarkId: bench.id,
      targetProvider: "anthropic",
      targetModel: "test-model",
    });
    expect(run.status).toBe("pending");
    expect(run.promptCount).toBe(1);

    // Wait for the fire-and-forget runBenchmark to complete
    await new Promise((r) => setTimeout(r, 1000));
    const updated = await prisma.driftRun.findUnique({ where: { id: run.id } });
    expect(updated!.status).toBe("completed");
    expect(updated!.avgScore).toBe(8);
  });

  it("throws for wrong org benchmark", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: { orgId: otherOrgId, name: "Other", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.drift.startRun({
        benchmarkId: bench.id,
        targetProvider: "anthropic",
        targetModel: "m",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws when benchmark has no prompts", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: { orgId, name: "Empty", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.drift.startRun({
        benchmarkId: bench.id,
        targetProvider: "anthropic",
        targetModel: "m",
      }),
    ).rejects.toThrow(/no prompts/i);
  });
});

describe("drift.runs", () => {
  it("paginates runs for a benchmark", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: { orgId, name: "B", createdById: userId },
    });
    for (let i = 0; i < 5; i++) {
      await prisma.driftRun.create({
        data: {
          orgId,
          benchmarkId: bench.id,
          targetProvider: "a",
          targetModel: "m",
          judgeModel: "j",
          promptCount: 1,
        },
      });
    }
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.runs({ benchmarkId: bench.id, limit: 3 });
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBeDefined();
  });
});

describe("drift.runById", () => {
  it("returns run with results and benchmark info", async () => {
    const bench = await prisma.driftBenchmark.create({
      data: {
        orgId,
        name: "B",
        threshold: 7.0,
        createdById: userId,
        prompts: {
          create: [
            { orgId, sortOrder: 0, promptText: "Q1", expectedBehavior: "A1" },
          ],
        },
      },
    });
    const prompt = await prisma.driftPrompt.findFirst({
      where: { benchmarkId: bench.id },
    });
    const run = await prisma.driftRun.create({
      data: {
        orgId,
        benchmarkId: bench.id,
        targetProvider: "a",
        targetModel: "m",
        judgeModel: "j",
        promptCount: 1,
        status: "completed",
        avgScore: 8,
      },
    });
    await prisma.driftResult.create({
      data: {
        runId: run.id,
        promptId: prompt!.id,
        orgId,
        actualOutput: "4",
        score: 8,
        judgment: "Good",
      },
    });

    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.runById({ id: run.id });
    expect(r!.status).toBe("completed");
    expect(r!.results).toHaveLength(1);
    expect(r!.results[0].score).toBe(8);
    expect(r!.benchmark.name).toBe("B");
  });
});

describe("drift usecase linking", () => {
  async function makeUsecase(oid: string) {
    return prisma.aiUsecase.create({
      data: {
        orgId: oid,
        name: `link-uc-${Date.now()}-${Math.random()}`,
        ownerId: userId,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
  }

  it("create persists usecaseId", async () => {
    const uc = await makeUsecase(orgId);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.drift.create({
      name: "Linked",
      prompts: [{ promptText: "q", expectedBehavior: "a" }],
      usecaseId: uc.id,
    });
    expect(r.usecaseId).toBe(uc.id);
    await prisma.aiUsecase.delete({ where: { id: uc.id } });
  });

  it("create rejects a foreign-org usecaseId", async () => {
    const uc = await makeUsecase(otherOrgId);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.drift.create({
        name: "Bad",
        prompts: [{ promptText: "q", expectedBehavior: "a" }],
        usecaseId: uc.id,
      }),
    ).rejects.toThrow(/not found/i);
    await prisma.aiUsecase.delete({ where: { id: uc.id } });
  });

  it("update sets then clears usecaseId", async () => {
    const uc = await makeUsecase(orgId);
    const bench = await prisma.driftBenchmark.create({
      data: { orgId, name: "U", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const set = await caller.drift.update({ id: bench.id, usecaseId: uc.id });
    expect(set.usecaseId).toBe(uc.id);
    const cleared = await caller.drift.update({
      id: bench.id,
      usecaseId: null,
    });
    expect(cleared.usecaseId).toBeNull();
    await prisma.aiUsecase.delete({ where: { id: uc.id } });
  });

  it("update rejects a foreign-org usecaseId", async () => {
    const uc = await makeUsecase(otherOrgId);
    const bench = await prisma.driftBenchmark.create({
      data: { orgId, name: "U2", createdById: userId },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await expect(
      caller.drift.update({ id: bench.id, usecaseId: uc.id }),
    ).rejects.toThrow(/not found/i);
    await prisma.aiUsecase.delete({ where: { id: uc.id } });
  });
});
