import { describe, it, expect, afterEach } from "vitest";
import {
  getRedisUrl,
  getWorkerConcurrency,
  getHealthPort,
  QUEUE_NAME,
} from "../config";

afterEach(() => {
  delete process.env.REDIS_URL;
  delete process.env.AIGP_WORKER_CONCURRENCY;
  delete process.env.AIGP_WORKER_HEALTH_PORT;
});

describe("jobs/config", () => {
  it("getRedisUrl returns null when unset", () => {
    delete process.env.REDIS_URL;
    expect(getRedisUrl()).toBeNull();
  });

  it("getRedisUrl returns trimmed url when set", () => {
    process.env.REDIS_URL = "  redis://localhost:6379  ";
    expect(getRedisUrl()).toBe("redis://localhost:6379");
  });

  it("getRedisUrl treats empty string as unset", () => {
    process.env.REDIS_URL = "   ";
    expect(getRedisUrl()).toBeNull();
  });

  it("getWorkerConcurrency defaults to 2", () => {
    delete process.env.AIGP_WORKER_CONCURRENCY;
    expect(getWorkerConcurrency()).toBe(2);
  });

  it("getWorkerConcurrency parses a positive integer", () => {
    process.env.AIGP_WORKER_CONCURRENCY = "5";
    expect(getWorkerConcurrency()).toBe(5);
  });

  it("getWorkerConcurrency rejects non-positive / non-numeric", () => {
    process.env.AIGP_WORKER_CONCURRENCY = "0";
    expect(getWorkerConcurrency()).toBe(2);
    process.env.AIGP_WORKER_CONCURRENCY = "abc";
    expect(getWorkerConcurrency()).toBe(2);
  });

  it("getHealthPort defaults to 9091", () => {
    delete process.env.AIGP_WORKER_HEALTH_PORT;
    expect(getHealthPort()).toBe(9091);
  });

  it("getHealthPort parses a positive integer", () => {
    process.env.AIGP_WORKER_HEALTH_PORT = "8080";
    expect(getHealthPort()).toBe(8080);
  });

  it("getHealthPort rejects non-positive / non-numeric", () => {
    process.env.AIGP_WORKER_HEALTH_PORT = "0";
    expect(getHealthPort()).toBe(9091);
    process.env.AIGP_WORKER_HEALTH_PORT = "abc";
    expect(getHealthPort()).toBe(9091);
  });

  it("exposes the queue name", () => {
    expect(QUEUE_NAME).toBe("aigp");
  });
});
