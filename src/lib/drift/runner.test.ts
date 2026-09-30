import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { prisma } from "@/lib/db";

let mockScore = 8;
let mockJudgment = "Good";

vi.mock("@/lib/runtime/providers/registry", () => ({
  getAdapter: () => ({
    streamChat: vi.fn().mockImplementation(async function* () {
      yield {
        delta: JSON.stringify({ score: mockScore, judgment: mockJudgment }),
        usage: { input: 50, output: 30 },
      };
    }),
  }),
}));

vi.mock("./config", () => ({
  isDriftEnabled: () => true,
  getJudgeProvider: () => ({
    kind: "anthropic",
    apiKey: "sk-test",
    model: "claude-haiku-4-5-20251001",
  }),
}));

import { runBenchmark } from "./runner";

let orgId: string;
let userId: string;
let benchmarkId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `Drift ${Date.now()}` },
  });
  orgId = org.id;
  const u = await prisma.user.create({
    data: { email: `drift-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.create({ data: { orgId, userId, role: "admin" } });

  const bench = await prisma.driftBenchmark.create({
    data: {
      orgId,
      name: "Test Benchmark",
      threshold: 7.0,
      createdById: userId,
      prompts: {
        create: [
          {
            orgId,
            sortOrder: 0,
            promptText: "What is 2+2?",
            expectedBehavior: "Should answer 4",
          },
          {
            orgId,
            sortOrder: 1,
            promptText: "What is the capital of France?",
            expectedBehavior: "Should answer Paris",
          },
        ],
      },
    },
  });
  benchmarkId = bench.id;
});

afterAll(async () => {
  await prisma.driftResult.deleteMany({ where: { orgId } });
  await prisma.driftRun.deleteMany({ where: { orgId } });
  await prisma.driftPrompt.deleteMany({ where: { orgId } });
  await prisma.driftBenchmark.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.driftResult.deleteMany({ where: { orgId } });
  await prisma.driftRun.deleteMany({ where: { orgId } });
  mockScore = 8;
  mockJudgment = "Good";
});

describe("runBenchmark", () => {
  it("completes a run with all prompts evaluated", async () => {
    const run = await prisma.driftRun.create({
      data: {
        orgId,
        benchmarkId,
        targetProvider: "anthropic",
        targetModel: "claude-haiku-4-5-20251001",
        judgeModel: "claude-haiku-4-5-20251001",
        promptCount: 2,
      },
    });

    await runBenchmark(run.id);

    const updated = await prisma.driftRun.findUnique({ where: { id: run.id } });
    expect(updated!.status).toBe("completed");
    expect(updated!.completedCount).toBe(2);
    expect(updated!.avgScore).toBe(8);
    expect(updated!.degraded).toBe(false);
    expect(updated!.completedAt).toBeTruthy();

    const results = await prisma.driftResult.findMany({
      where: { runId: run.id },
    });
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(8);
    expect(results[0].judgment).toBe("Good");
  });

  it("sets degraded=true when avgScore < threshold", async () => {
    mockScore = 3;
    mockJudgment = "Poor";

    const run = await prisma.driftRun.create({
      data: {
        orgId,
        benchmarkId,
        targetProvider: "anthropic",
        targetModel: "test",
        judgeModel: "test",
        promptCount: 2,
      },
    });

    await runBenchmark(run.id);

    const updated = await prisma.driftRun.findUnique({ where: { id: run.id } });
    expect(updated!.status).toBe("completed");
    expect(updated!.degraded).toBe(true);
    expect(updated!.avgScore).toBe(3);
  });

  it("clears prior results and aggregates on restart (idempotent)", async () => {
    const run = await prisma.driftRun.create({
      data: {
        orgId,
        benchmarkId,
        targetProvider: "anthropic",
        targetModel: "claude-haiku-4-5-20251001",
        judgeModel: "claude-haiku-4-5-20251001",
        promptCount: 2,
        status: "running",
        completedCount: 1,
        avgScore: 1,
        degraded: true,
      },
    });
    // a stale partial result from a crashed earlier attempt
    const prompt = await prisma.driftPrompt.findFirst({ where: { orgId } });
    await prisma.driftResult.create({
      data: {
        orgId,
        runId: run.id,
        promptId: prompt!.id,
        actualOutput: "stale",
        score: 1,
        judgment: "stale",
      },
    });

    await runBenchmark(run.id);

    const results = await prisma.driftResult.findMany({
      where: { runId: run.id },
    });
    expect(results).toHaveLength(2); // exactly the 2 prompts, no stale row
    expect(results.every((r) => r.judgment !== "stale")).toBe(true);

    const updated = await prisma.driftRun.findUnique({ where: { id: run.id } });
    expect(updated!.status).toBe("completed");
    expect(updated!.completedCount).toBe(2);
    expect(updated!.avgScore).toBe(8);
    expect(updated!.degraded).toBe(false);
  });
});
