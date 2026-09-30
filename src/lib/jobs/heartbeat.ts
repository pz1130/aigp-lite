/**
 * Worker liveness heartbeat. The worker periodically writes a small JSON blob to
 * one Redis key with a TTL; the /healthz probe reads it and reports stale/ok based
 * on freshness. Liveness only — a "fresh" worker can still have a broken processor
 * (that's what the smoke test covers). Key name + serialization live here so the
 * writer (worker) and reader (probe, smoke test) can't drift apart.
 */

export const HEARTBEAT_KEY = "aigp:worker:heartbeat";

/** TTL on the key: if the worker dies, the heartbeat self-expires from Redis. */
export const HEARTBEAT_TTL_SECONDS = 60;

/** How often the worker refreshes its heartbeat (well under the TTL). */
export const HEARTBEAT_INTERVAL_MS = 15_000;

export interface Heartbeat {
  /** epoch ms when the heartbeat was written */
  ts: number;
  /** jobs completed since the worker booted */
  completed: number;
  /** jobs failed since the worker booted */
  failed: number;
  /** writer process pid (debugging which worker is alive) */
  pid: number;
}

/** The slice of ioredis the heartbeat needs; lets tests pass a fake. */
export interface HeartbeatStore {
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number,
  ): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

/** Write a fresh heartbeat (ts/pid filled in here) with the standard TTL. */
export async function writeHeartbeat(
  store: HeartbeatStore,
  counters: { completed: number; failed: number },
): Promise<void> {
  const hb: Heartbeat = {
    ts: Date.now(),
    completed: counters.completed,
    failed: counters.failed,
    pid: process.pid,
  };
  await store.set(
    HEARTBEAT_KEY,
    JSON.stringify(hb),
    "EX",
    HEARTBEAT_TTL_SECONDS,
  );
}

/** Read the current heartbeat, or null if absent / unparseable. */
export async function readHeartbeat(
  store: HeartbeatStore,
): Promise<Heartbeat | null> {
  const raw = await store.get(HEARTBEAT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Heartbeat;
  } catch {
    return null;
  }
}

/** True when there is no heartbeat or it is older than maxAgeMs. */
export function isStale(hb: Heartbeat | null, maxAgeMs: number): boolean {
  if (!hb) return true;
  return Date.now() - hb.ts > maxAgeMs;
}
