import { afterEach, describe, it, expect, vi } from "vitest";
import { RateLimiter } from "./tokenBucket";

describe("consumeByKey", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows N then blocks with a resetAt", () => {
    const rl = new RateLimiter({ requestsPerMinute: 3, windowMs: 600_000 });
    expect(rl.consumeByKey("ip-a").allowed).toBe(true);
    expect(rl.consumeByKey("ip-a").allowed).toBe(true);
    expect(rl.consumeByKey("ip-a").allowed).toBe(true);
    const blocked = rl.consumeByKey("ip-a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetAt).toBeGreaterThan(Date.now());
  });

  it("keys are independent", () => {
    const rl = new RateLimiter({ requestsPerMinute: 1, windowMs: 600_000 });
    expect(rl.consumeByKey("ip-a").allowed).toBe(true);
    expect(rl.consumeByKey("ip-a").allowed).toBe(false);
    expect(rl.consumeByKey("ip-b").allowed).toBe(true);
  });

  it("uses the local fallback when Redis is not configured", async () => {
    vi.stubEnv("REDIS_URL", "");
    const rl = new RateLimiter({ requestsPerMinute: 1, windowMs: 600_000 });

    expect((await rl.consumeByKeyAsync("ip-a")).allowed).toBe(true);
    expect((await rl.consumeByKeyAsync("ip-a")).allowed).toBe(false);
  });

  it("fails closed in production when configured Redis is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6399");
    const rl = new RateLimiter({ requestsPerMinute: 1, windowMs: 600_000 });

    const result = await rl.consumeByKeyAsync("ip-production");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it.skipIf(!process.env.REDIS_URL)(
    "uses the Redis path when Redis is configured",
    async () => {
      const rl = new RateLimiter(
        { requestsPerMinute: 1, windowMs: 600_000 },
        `redis-test-${Date.now()}`,
      );
      const key = `ip-${Date.now()}`;

      expect((await rl.consumeByKeyAsync(key)).allowed).toBe(true);
      expect((await rl.consumeByKeyAsync(key)).allowed).toBe(false);
    },
  );
});
