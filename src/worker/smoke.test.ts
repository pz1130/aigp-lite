import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { getConnection, __resetConnection } from "@/lib/jobs/connection";
import { readHeartbeat } from "@/lib/jobs/heartbeat";
import { pingKey } from "@/lib/jobs/processors/worker-ping";
import { startWorker, type RunningWorker } from "./index";

/**
 * End-to-end smoke: the one test that proves the worker actually BOOTS, CONNECTS,
 * and DRAINS a job to completion — not merely that enqueue takes the Redis branch.
 * A processor throwing on import, a missing dispatch case, or an unregistered
 * handler would all pass every other test but fail here.
 *
 * Gated on REDIS_URL: skipped (not failed) in the inline environment, runs in the
 * CI Redis leg (docs/ci.md). It is the ONLY test that runs a live worker loop, so
 * it MUST be isolated and clean up its worker + keys in afterAll, or it will eat
 * jobs other tests enqueue.
 */
const REDIS = !!process.env.REDIS_URL;

async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 100,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

describe.skipIf(!REDIS)("worker smoke (Redis required)", () => {
  let running: RunningWorker;
  const nonce = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ORIGINAL_HEALTH_PORT = process.env.AIGP_WORKER_HEALTH_PORT;

  beforeAll(() => {
    // Ephemeral health port so the smoke worker never collides with a real one.
    process.env.AIGP_WORKER_HEALTH_PORT = "0";
    running = startWorker();
  });

  afterAll(async () => {
    await running.stop();
    const conn = getConnection();
    if (conn) {
      await conn.del(pingKey(nonce));
    }
    __resetConnection();
    if (ORIGINAL_HEALTH_PORT === undefined)
      delete process.env.AIGP_WORKER_HEALTH_PORT;
    else process.env.AIGP_WORKER_HEALTH_PORT = ORIGINAL_HEALTH_PORT;
  });

  it("enqueue -> worker drains the job -> heartbeat advances", async () => {
    await enqueueJob("worker.ping", { nonce });

    const conn = getConnection();
    expect(conn).not.toBeNull();

    // The processor writes the nonce marker only after the worker drains the job.
    const drained = await waitFor(
      async () => (await conn!.get(pingKey(nonce))) !== null,
      15_000,
    );
    expect(drained).toBe(true);

    // And the worker's heartbeat reflects at least one completed job, freshly.
    const hb = await readHeartbeat(conn!);
    expect(hb).not.toBeNull();
    expect(hb!.completed).toBeGreaterThanOrEqual(1);
    expect(Date.now() - hb!.ts).toBeLessThan(60_000);
  });
});
