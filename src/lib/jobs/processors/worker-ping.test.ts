import { describe, it, expect, vi, beforeEach } from "vitest";

const { getConnection } = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock("../connection", () => ({ getConnection }));

import { processWorkerPing, pingKey, PING_TTL_SECONDS } from "./worker-ping";

beforeEach(() => vi.clearAllMocks());

describe("jobs/processors/worker-ping", () => {
  it("writes the nonce marker key with a TTL when Redis is available", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getConnection.mockReturnValue({ set });

    await processWorkerPing({ nonce: "abc123" });

    expect(set).toHaveBeenCalledWith(
      pingKey("abc123"),
      expect.any(String),
      "EX",
      PING_TTL_SECONDS,
    );
  });

  it("is a no-op when Redis is unavailable", async () => {
    getConnection.mockReturnValue(null);
    await expect(processWorkerPing({ nonce: "x" })).resolves.toBeUndefined();
  });

  it("pingKey namespaces by nonce", () => {
    expect(pingKey("n1")).toBe("aigp:worker:ping:n1");
  });
});
