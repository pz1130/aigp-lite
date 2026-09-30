import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, redisPing } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  redisPing: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: queryMock },
}));

vi.mock("ioredis", () => {
  class MockRedis {
    on() {
      return this;
    }

    ping = redisPing;

    disconnect() {}
  }

  return { default: MockRedis };
});

import { GET } from "./route";

describe("GET /api/ready", () => {
  beforeEach(() => {
    queryMock.mockResolvedValue([]);
    redisPing.mockResolvedValue("PONG");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    queryMock.mockReset();
    redisPing.mockReset();
  });

  it("reports ready when the database works and Redis is not configured", async () => {
    vi.stubEnv("REDIS_URL", "");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      checks: { database: "ok", redis: "not_configured" },
    });
  });

  it("reports ready when configured Redis responds", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("returns 503 when the database is unavailable", async () => {
    vi.stubEnv("REDIS_URL", "");
    queryMock.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      checks: { database: "error", redis: "not_configured" },
    });
  });

  it("returns 503 when configured Redis is unavailable", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    redisPing.mockRejectedValue(new Error("redis unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      checks: { database: "ok", redis: "error" },
    });
  });
});
