import { describe, it, expect, afterEach } from "vitest";
import { isNemoEnabled, getNemoConfig } from "./config";

const KEYS = [
  "AIGP_NEMO_URL",
  "AIGP_NEMO_API_KEY",
  "AIGP_NEMO_CONFIG_ID",
  "AIGP_NEMO_TIMEOUT_MS",
];
afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe("nemo config", () => {
  it("isNemoEnabled reflects AIGP_NEMO_URL presence", () => {
    expect(isNemoEnabled()).toBe(false);
    process.env.AIGP_NEMO_URL = "http://nemo:9000";
    expect(isNemoEnabled()).toBe(true);
  });

  it("getNemoConfig trims trailing slash and applies defaults", () => {
    process.env.AIGP_NEMO_URL = "http://nemo:9000/";
    const cfg = getNemoConfig();
    expect(cfg.baseUrl).toBe("http://nemo:9000");
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.configId).toBe("aigp_judge");
    expect(cfg.timeoutMs).toBe(60000);
  });

  it("getNemoConfig honors overrides", () => {
    process.env.AIGP_NEMO_URL = "http://x:1";
    process.env.AIGP_NEMO_API_KEY = "k";
    process.env.AIGP_NEMO_CONFIG_ID = "custom";
    process.env.AIGP_NEMO_TIMEOUT_MS = "12000";
    const cfg = getNemoConfig();
    expect(cfg.apiKey).toBe("k");
    expect(cfg.configId).toBe("custom");
    expect(cfg.timeoutMs).toBe(12000);
  });

  it("getNemoConfig throws when url missing", () => {
    expect(() => getNemoConfig()).toThrow(/AIGP_NEMO_URL/);
  });
});
