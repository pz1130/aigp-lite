import type { Queue } from "bullmq";
import { getConnection } from "./connection";
import { QUEUE_NAME } from "./config";

let cached: Queue | null = null;

/**
 * The shared producer-side queue, or null when Redis is not configured.
 *
 * BullMQ is loaded via a runtime dynamic import (not a static top-level
 * import) so it stays out of the Next.js bundle's static module graph. That
 * keeps BullMQ's `child-processor` "Critical dependency: the request of a
 * dependency is an expression" warning out of `next build`, and the library is
 * only ever loaded when Redis is actually configured. The `import type` above
 * is erased at compile time and adds no runtime edge.
 */
export async function getQueue(): Promise<Queue | null> {
  const connection = getConnection();
  if (!connection) return null;
  if (cached) return cached;
  const { Queue } = await import("bullmq");
  cached = new Queue(QUEUE_NAME, { connection });
  return cached;
}

/** Test-only: drop the cached queue. */
export function __resetQueue(): void {
  cached = null;
}
