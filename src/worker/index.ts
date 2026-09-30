// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { Worker, Queue } from "bullmq";
import { getConnection } from "@/lib/jobs/connection";
import {
  QUEUE_NAME,
  getWorkerConcurrency,
  getHealthPort,
} from "@/lib/jobs/config";
import { runProcessor } from "@/lib/jobs/processors";
import { writeHeartbeat, HEARTBEAT_INTERVAL_MS } from "@/lib/jobs/heartbeat";
import { startHealthServer } from "./health-server";
import { metric } from "@/lib/incidents/metrics";
import type { JobName, JobPayload } from "@/lib/jobs/types";

export interface RunningWorker {
  worker: Worker;
  healthServer: Server;
  /** Stop the heartbeat timer, drain the worker, and close the health server. */
  stop: () => Promise<void>;
}

/**
 * Construct and start the production worker: queue consumer + liveness heartbeat
 * + /healthz server. Exported (not just run) so the smoke test boots the exact
 * same worker rather than a copy. Throws if Redis is not configured.
 */
export function startWorker(): RunningWorker {
  const connection = getConnection();
  if (!connection) {
    throw new Error("REDIS_URL is not set — the worker cannot start.");
  }

  let completed = 0;
  let failed = 0;
  const beat = () =>
    writeHeartbeat(connection, { completed, failed }).catch((err) =>
      console.error("[worker] heartbeat write failed:", err),
    );

  const concurrency = getWorkerConcurrency();
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      metric("jobs.started", { name: job.name });
      await runProcessor(job.name as JobName, job.data as JobPayload);
    },
    { connection, concurrency },
  );

  worker.on("completed", (job) => {
    completed++;
    metric("jobs.completed", { name: job.name });
    void beat();
  });
  worker.on("failed", (job, err) => {
    failed++;
    metric("jobs.failed", { name: job?.name ?? "unknown" });
    console.error(`[worker] job ${job?.name} (${job?.id}) failed:`, err);
    void beat();
  });

  // Periodic beat so an idle-but-alive worker stays fresh between jobs. unref so
  // the timer never keeps the process (or a test runner) alive on its own.
  const heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
  void beat(); // one immediate beat on boot so /healthz is green right away

  const healthServer = startHealthServer(getHealthPort());

  const schedulerQueue = new Queue(QUEUE_NAME, { connection });
  void schedulerQueue
    .upsertJobScheduler(
      "mcp.driftSweep",
      { pattern: "10 4 * * *" },
      { name: "mcp.driftSweep", data: {} },
    )
    .catch((err) =>
      console.error(
        "[worker] failed to register mcp.driftSweep scheduler:",
        err,
      ),
    )
    .finally(() => void schedulerQueue.close());

  const stop = async () => {
    clearInterval(heartbeatTimer);
    await worker.close();
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  };

  return { worker, healthServer, stop };
}

function main(): void {
  let running: RunningWorker;
  try {
    running = startWorker();
  } catch (err) {
    console.error(`[worker] ${(err as Error).message} Exiting.`);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — closing...`);
    await running.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log(
    `[worker] listening on "${QUEUE_NAME}" (concurrency=${getWorkerConcurrency()}); ` +
      `/healthz on :${getHealthPort()}`,
  );
}

// Run only when executed directly (tsx src/worker/index.ts), not when imported
// by the smoke test — otherwise importing startWorker would boot a real worker.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
