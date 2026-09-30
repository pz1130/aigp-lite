import { describe, it, expect, afterEach } from "vitest";
import {
  isQueueEnabled,
  getConnection,
  __resetConnection,
} from "../connection";

afterEach(() => {
  delete process.env.REDIS_URL;
  __resetConnection();
});

describe("jobs/connection", () => {
  it("isQueueEnabled is false when REDIS_URL is unset", () => {
    delete process.env.REDIS_URL;
    expect(isQueueEnabled()).toBe(false);
  });

  it("getConnection returns null when disabled", () => {
    delete process.env.REDIS_URL;
    expect(getConnection()).toBeNull();
  });
});
