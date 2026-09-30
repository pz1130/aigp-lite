import { getConnection } from "../connection";

/**
 * Smoke-test processor. `worker.ping` carries a nonce; processing it just writes
 * a short-lived marker key to Redis so the smoke test can prove the worker
 * actually drained the job (not merely that it was enqueued). No business effect.
 */

export const PING_KEY_PREFIX = "aigp:worker:ping:";
export const PING_TTL_SECONDS = 60;

export function pingKey(nonce: string): string {
  return `${PING_KEY_PREFIX}${nonce}`;
}

export async function processWorkerPing({
  nonce,
}: {
  nonce: string;
}): Promise<void> {
  const conn = getConnection();
  // Without Redis there is no marker store and no smoke test to observe it.
  if (!conn) return;
  await conn.set(pingKey(nonce), String(Date.now()), "EX", PING_TTL_SECONDS);
}
