import IORedis, { type Redis } from "ioredis";
import { getRedisUrl } from "./config";

let cached: Redis | null = null;

/** True when REDIS_URL is configured (queue mode); false means inline fallback. */
export function isQueueEnabled(): boolean {
  return getRedisUrl() !== null;
}

/** Lazily create one shared ioredis connection, or null when disabled. */
export function getConnection(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;
  if (cached) return cached;
  // maxRetriesPerRequest: null is required by BullMQ blocking commands.
  cached = new IORedis(url, { maxRetriesPerRequest: null });
  return cached;
}

/** Test-only: drop the cached connection so env changes take effect. */
export function __resetConnection(): void {
  cached = null;
}
