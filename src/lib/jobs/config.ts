import type { JobsOptions } from "bullmq";

export const QUEUE_NAME = "aigp";

/** The Redis connection string, or null when the queue is disabled. */
export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : null;
}

/** Worker concurrency; defaults to 2, ignores non-positive / non-numeric input. */
export function getWorkerConcurrency(): number {
  const raw = Number(process.env.AIGP_WORKER_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 2;
}

/** Port for the worker's /healthz liveness server; defaults to 9091. */
export function getHealthPort(): number {
  const raw = Number(process.env.AIGP_WORKER_HEALTH_PORT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 9091;
}

/** Default per-job options: bounded retries with backoff, auto-clean. */
export const JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60 }, // keep 1 day
  removeOnFail: { age: 7 * 24 * 60 * 60 }, // keep 7 days
};
