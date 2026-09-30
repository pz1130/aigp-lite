import IORedis, { type Redis } from "ioredis";
import { getRedisUrl } from "@/lib/jobs/config";

/**
 * Token bucket rate limiter with an optional Redis-backed path.
 * The in-memory path remains the fallback for local development and CI.
 */

export interface RateLimitConfig {
  requestsPerMinute: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  requestsPerMinute: 60,
  windowMs: 60_000,
};

interface Bucket {
  tokens: number;
  lastRefill: number;
  orgId: string;
}

const REDIS_SCRIPT = `
local capacity = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local values = redis.call("HMGET", KEYS[1], "tokens", "lastRefill")
local tokens = tonumber(values[1])
local lastRefill = tonumber(values[2])

if not tokens or not lastRefill then
  tokens = capacity
  lastRefill = now
end

local added = math.floor(((now - lastRefill) / window) * capacity)
if added > 0 then
  tokens = math.min(capacity, tokens + added)
  lastRefill = now
end

local allowed = 0
if tokens > 0 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HSET", KEYS[1], "tokens", tokens, "lastRefill", lastRefill)
redis.call("PEXPIRE", KEYS[1], window * 2)
local resetAt = allowed == 1 and 0 or (lastRefill + window)
return { allowed, tokens, resetAt }
`;

let redis: Redis | null = null;
let lastRedisWarningAt = 0;

function getRateLimitRedis(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;
  if (redis) return redis;
  redis = new IORedis(url, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  // ioredis emits connection failures asynchronously as well as rejecting
  // commands. Attach a listener so a transient outage never becomes an
  // unhandled process-level error.
  redis.on("error", (error) => warnRedisFallback(error));
  return redis;
}

function warnRedisFallback(error: unknown): void {
  const now = Date.now();
  if (now - lastRedisWarningAt < 60_000) return;
  lastRedisWarningAt = now;
  console.warn(
    process.env.NODE_ENV === "production"
      ? "[rate-limit] Redis unavailable; production request denied"
      : "[rate-limit] Redis unavailable; using local fallback",
    error,
  );
}

function redisKey(namespace: string, key: string): string {
  return `aigp:rate-limit:${namespace}:${Buffer.from(key).toString("base64url")}`;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private config: RateLimitConfig;
  private namespace: string;

  constructor(config: Partial<RateLimitConfig> = {}, namespace = "default") {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.namespace = namespace;
  }

  /** Returns true only if the org has fully cooled down (tokens refilled to capacity). */
  isRefilled(orgId: string): boolean {
    const bucket = this.buckets.get(orgId);
    if (!bucket) return true;
    return Date.now() >= bucket.lastRefill + this.config.windowMs;
  }

  consume(orgId: string): ConsumeResult {
    return this.consumeByKey(orgId);
  }

  consumeByKey(key: string): ConsumeResult {
    const now = Date.now();
    const { requestsPerMinute, windowMs } = this.config;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: requestsPerMinute, lastRefill: now, orgId: key };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((elapsed / windowMs) * requestsPerMinute);
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(requestsPerMinute, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.lastRefill + windowMs,
      };
    }

    bucket.tokens -= 1;
    return { allowed: true, remaining: bucket.tokens, resetAt: 0 };
  }

  /**
   * Atomically consume from Redis when configured. If Redis is disabled, use
   * the local limiter. In production, a configured but unavailable Redis is a
   * fail-closed condition so a multi-instance deployment cannot bypass the
   * public endpoint limit during an outage. Development and test keep the
   * local fallback for convenience.
   */
  async consumeByKeyAsync(key: string): Promise<ConsumeResult> {
    const connection = getRateLimitRedis();
    if (!connection) return this.consumeByKey(key);

    try {
      const result = (await connection.eval(
        REDIS_SCRIPT,
        1,
        redisKey(this.namespace, key),
        this.config.requestsPerMinute,
        this.config.windowMs,
        Date.now(),
      )) as [number, number, number];
      return {
        allowed: result[0] === 1,
        remaining: Number(result[1]),
        resetAt: Number(result[2]),
      };
    } catch (error) {
      warnRedisFallback(error);
      redis?.disconnect();
      redis = null;
      if (process.env.NODE_ENV === "production") {
        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 1_000,
        };
      }
      return this.consumeByKey(key);
    }
  }

  /**
   * Remove buckets whose window has fully expired.
   * Call periodically or on a schedule.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [orgId, bucket] of this.buckets.entries()) {
      if (now >= bucket.lastRefill + this.config.windowMs) {
        this.buckets.delete(orgId);
      }
    }
  }
}

// Singleton for the application
export const rateLimiter = new RateLimiter({}, "default");

// External-report public intake: 5 submissions / 10 minutes / IP.
export const externalReportRateLimiter = new RateLimiter(
  {
    requestsPerMinute: 5,
    windowMs: 600_000,
  },
  "external-report",
);

// Trust Center. The token itself is not brute-forceable; these buckets stop
// the endpoints being used as a database-load amplifier and — because
// `writeAudit` serializes an org's audit writes behind an advisory lock — as a
// lock amplifier against that org's internal audit traffic.
export const trustRedeemRateLimiter = new RateLimiter(
  {
    requestsPerMinute: 10,
    windowMs: 600_000,
  },
  "trust-redeem",
);

export const trustViewRateLimiter = new RateLimiter(
  {
    requestsPerMinute: 300,
    windowMs: 600_000,
  },
  "trust-view",
);
