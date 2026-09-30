import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guard test for the CI Redis leg (docs/ci.md).
 *
 * Unlike __tests__/enqueue.test.ts — which stubs getQueue() directly — this test
 * exercises the REAL branch-selection path driven by `process.env.REDIS_URL`
 * (getRedisUrl -> getConnection -> getQueue), with BullMQ and ioredis stubbed so
 * no real Redis connection is opened. Its job is to lock in the behaviour CI now
 * relies on: when REDIS_URL is set, enqueueJob takes the queue branch AND emits
 * `metric("jobs.enqueued")`. That metric call is the one that previously had zero
 * CI coverage and broke when a metrics mock omitted `metric`.
 */

const { addMock, metricMock, countMock, distributionMock, runProcessorMock } =
  vi.hoisted(() => ({
    addMock: vi.fn().mockResolvedValue(undefined),
    metricMock: vi.fn(),
    countMock: vi.fn(),
    distributionMock: vi.fn(),
    runProcessorMock: vi.fn().mockResolvedValue(undefined),
  }));

// Stub BullMQ Queue so getQueue() never dials a real server.
vi.mock("bullmq", () => ({
  Queue: class {
    add = addMock;
  },
}));
// Stub ioredis so getConnection()'s `new IORedis(...)` is inert.
vi.mock("ioredis", () => ({ default: class {} }));
// enqueue.ts imports `metric` from @/lib/incidents/metrics (re-export of
// @/lib/observability/metrics); mock the path it actually imports.
vi.mock("@/lib/incidents/metrics", () => ({
  metric: metricMock,
  count: countMock,
  distribution: distributionMock,
}));
// Keep the inline branch observable without running real processors.
vi.mock("./processors", () => ({ runProcessor: runProcessorMock }));

import { enqueueJob } from "./enqueue";
import { __resetQueue } from "./queue";
import { __resetConnection } from "./connection";

const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

function restoreEnv() {
  if (ORIGINAL_REDIS_URL === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = ORIGINAL_REDIS_URL;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetQueue();
  __resetConnection();
});

afterEach(() => {
  restoreEnv();
  __resetQueue();
  __resetConnection();
});

describe("enqueueJob branch selection by REDIS_URL", () => {
  it("takes the Redis queue branch and emits metric('jobs.enqueued') when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    __resetQueue();
    __resetConnection();

    await enqueueJob("drift.run", { runId: "r1" });

    expect(addMock).toHaveBeenCalledWith(
      "drift.run",
      { runId: "r1" },
      expect.objectContaining({ jobId: "drift.run__r1" }),
    );
    expect(metricMock).toHaveBeenCalledWith("jobs.enqueued", {
      name: "drift.run",
    });
    expect(runProcessorMock).not.toHaveBeenCalled();
  });

  it("takes the inline branch (no queue, no jobs.enqueued metric) when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    __resetQueue();
    __resetConnection();

    await enqueueJob("drift.run", { runId: "r1" });
    // enqueue's inline path runs the processor on a detached microtask; flush it.
    await new Promise((r) => setTimeout(r, 0));

    expect(addMock).not.toHaveBeenCalled();
    expect(metricMock).not.toHaveBeenCalledWith(
      "jobs.enqueued",
      expect.anything(),
    );
    expect(runProcessorMock).toHaveBeenCalledWith("drift.run", { runId: "r1" });
  });
});
