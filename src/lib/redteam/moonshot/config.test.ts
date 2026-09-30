import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isMoonshotEngineEnabled, getMoonshotConfig } from "./config";

describe("moonshot config", () => {
  const keys = [
    "AIGP_MOONSHOT_URL",
    "AIGP_MOONSHOT_API_KEY",
    "AIGP_MOONSHOT_POLL_INTERVAL_MS",
    "AIGP_MOONSHOT_POLL_TIMEOUT_MS",
  ];
  let prev: Record<string, string | undefined>;
  beforeEach(() => {
    prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k]!;
    }
  });

  it("disabled when URL unset", () => {
    delete process.env.AIGP_MOONSHOT_URL;
    expect(isMoonshotEngineEnabled()).toBe(false);
  });

  it("enabled + returns config when URL set", () => {
    process.env.AIGP_MOONSHOT_URL = "http://moonshot:5000";
    process.env.AIGP_MOONSHOT_API_KEY = "k";
    expect(isMoonshotEngineEnabled()).toBe(true);
    expect(getMoonshotConfig().baseUrl).toBe("http://moonshot:5000");
  });

  it("defaults poll interval 2000ms and timeout 600000ms", () => {
    process.env.AIGP_MOONSHOT_URL = "http://moonshot:5000";
    const cfg = getMoonshotConfig();
    expect(cfg.pollIntervalMs).toBe(2000);
    expect(cfg.pollTimeoutMs).toBe(600000);
  });

  it("reads poll overrides from env", () => {
    process.env.AIGP_MOONSHOT_URL = "http://moonshot:5000";
    process.env.AIGP_MOONSHOT_POLL_INTERVAL_MS = "500";
    process.env.AIGP_MOONSHOT_POLL_TIMEOUT_MS = "30000";
    const cfg = getMoonshotConfig();
    expect(cfg.pollIntervalMs).toBe(500);
    expect(cfg.pollTimeoutMs).toBe(30000);
  });
});
