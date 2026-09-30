import { describe, it, expect, beforeEach } from "vitest";
import {
  HEARTBEAT_KEY,
  writeHeartbeat,
  readHeartbeat,
  isStale,
  type Heartbeat,
} from "./heartbeat";

/**
 * A tiny in-memory stand-in for the slice of ioredis the heartbeat uses
 * (`set key value EX ttl` / `get key`). Lets us round-trip without a real Redis.
 */
function fakeStore() {
  const map = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    map,
    ttls,
    async set(key: string, value: string, mode: "EX", ttl: number) {
      expect(mode).toBe("EX");
      map.set(key, value);
      ttls.set(key, ttl);
      return "OK";
    },
    async get(key: string) {
      return map.get(key) ?? null;
    },
  };
}

describe("jobs/heartbeat", () => {
  let store: ReturnType<typeof fakeStore>;
  beforeEach(() => {
    store = fakeStore();
  });

  it("writeHeartbeat stores the key with a TTL", async () => {
    await writeHeartbeat(store, { completed: 3, failed: 1 });
    expect(store.map.has(HEARTBEAT_KEY)).toBe(true);
    expect(store.ttls.get(HEARTBEAT_KEY)).toBeGreaterThan(0);
  });

  it("readHeartbeat round-trips the payload incl. ts and pid", async () => {
    const before = Date.now();
    await writeHeartbeat(store, { completed: 7, failed: 2 });
    const hb = await readHeartbeat(store);
    expect(hb).not.toBeNull();
    expect(hb!.completed).toBe(7);
    expect(hb!.failed).toBe(2);
    expect(hb!.pid).toBe(process.pid);
    expect(hb!.ts).toBeGreaterThanOrEqual(before);
    expect(hb!.ts).toBeLessThanOrEqual(Date.now());
  });

  it("readHeartbeat returns null when no heartbeat exists", async () => {
    expect(await readHeartbeat(store)).toBeNull();
  });

  it("readHeartbeat returns null on malformed JSON", async () => {
    store.map.set(HEARTBEAT_KEY, "not-json{");
    expect(await readHeartbeat(store)).toBeNull();
  });

  it("isStale is false for a fresh heartbeat", () => {
    const hb: Heartbeat = { ts: Date.now(), completed: 0, failed: 0, pid: 1 };
    expect(isStale(hb, 30_000)).toBe(false);
  });

  it("isStale is true for an old heartbeat", () => {
    const hb: Heartbeat = {
      ts: Date.now() - 60_000,
      completed: 0,
      failed: 0,
      pid: 1,
    };
    expect(isStale(hb, 30_000)).toBe(true);
  });

  it("isStale is true for a missing heartbeat", () => {
    expect(isStale(null, 30_000)).toBe(true);
  });
});
