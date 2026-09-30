import { describe, it, expect, afterEach } from "vitest";
import { getUsageInsightsConfig } from "./config";

const KEYS = [
  "USAGE_INSIGHTS_WINDOW_DAYS",
  "USAGE_INSIGHTS_MIN_CLUSTER_SIZE",
] as const;

afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe("getUsageInsightsConfig", () => {
  it("defaults k (minClusterSize) to 5", () => {
    expect(getUsageInsightsConfig().minClusterSize).toBe(5);
  });
  it("reads k from env", () => {
    process.env.USAGE_INSIGHTS_MIN_CLUSTER_SIZE = "10";
    expect(getUsageInsightsConfig().minClusterSize).toBe(10);
  });
  it("falls back on non-numeric env", () => {
    process.env.USAGE_INSIGHTS_WINDOW_DAYS = "abc";
    expect(getUsageInsightsConfig().windowDays).toBe(90);
  });
});
