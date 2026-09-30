import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { getConnection, readHeartbeat } = vi.hoisted(() => ({
  getConnection: vi.fn(() => ({}) as unknown),
  readHeartbeat: vi.fn(),
}));
vi.mock("@/lib/jobs/connection", () => ({ getConnection }));
// Mock only the reader; isStale stays real so freshness logic is exercised.
vi.mock("@/lib/jobs/heartbeat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jobs/heartbeat")>();
  return { ...actual, readHeartbeat };
});

import { startHealthServer } from "./health-server";

let server: Server;

function baseUrl(): string {
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  getConnection.mockReturnValue({});
  // Bind to an ephemeral port (0) so tests never collide on a fixed port.
  server = startHealthServer(0);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("worker/health-server", () => {
  it("GET /healthz -> 200 ok when a fresh heartbeat is present", async () => {
    readHeartbeat.mockResolvedValue({
      ts: Date.now(),
      completed: 5,
      failed: 0,
      pid: 1,
    });
    const res = await fetch(`${baseUrl()}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("GET /healthz -> 503 stale when heartbeat is missing", async () => {
    readHeartbeat.mockResolvedValue(null);
    const res = await fetch(`${baseUrl()}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "stale" });
  });

  it("GET /healthz -> 503 stale when heartbeat is old", async () => {
    readHeartbeat.mockResolvedValue({
      ts: Date.now() - 600_000,
      completed: 5,
      failed: 0,
      pid: 1,
    });
    const res = await fetch(`${baseUrl()}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "stale" });
  });

  it("GET /healthz -> 503 stale when Redis is unavailable", async () => {
    getConnection.mockReturnValue(null);
    const res = await fetch(`${baseUrl()}/healthz`);
    expect(res.status).toBe(503);
    expect(readHeartbeat).not.toHaveBeenCalled();
  });

  it("unknown path -> 404", async () => {
    const res = await fetch(`${baseUrl()}/nope`);
    expect(res.status).toBe(404);
  });
});
