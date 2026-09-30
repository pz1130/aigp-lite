import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isRcaEnabled, getRcaConfig } from "./config";

const ORIG = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG };
});
afterEach(() => {
  process.env = ORIG;
});

describe("incident-rca config", () => {
  it("isRcaEnabled false when no provider configured", () => {
    delete process.env.INCIDENT_RCA_PROVIDER;
    delete process.env.INCIDENT_RCA_API_KEY;
    delete process.env.INCIDENT_RCA_MODEL;
    expect(isRcaEnabled()).toBe(false);
  });

  it("isRcaEnabled false if any one of the three env vars is missing", () => {
    process.env.INCIDENT_RCA_PROVIDER = "anthropic";
    process.env.INCIDENT_RCA_API_KEY = "sk-x";
    delete process.env.INCIDENT_RCA_MODEL;
    expect(isRcaEnabled()).toBe(false);
  });

  it("isRcaEnabled true when all three present and provider known", () => {
    process.env.INCIDENT_RCA_PROVIDER = "anthropic";
    process.env.INCIDENT_RCA_API_KEY = "sk-x";
    process.env.INCIDENT_RCA_MODEL = "claude-opus-4-7";
    expect(isRcaEnabled()).toBe(true);
  });

  it("isRcaEnabled false when provider is unknown string", () => {
    process.env.INCIDENT_RCA_PROVIDER = "bogus";
    process.env.INCIDENT_RCA_API_KEY = "sk-x";
    process.env.INCIDENT_RCA_MODEL = "model";
    expect(isRcaEnabled()).toBe(false);
  });

  it("getRcaConfig throws when disabled", () => {
    delete process.env.INCIDENT_RCA_PROVIDER;
    expect(() => getRcaConfig()).toThrow();
  });

  it("getRcaConfig returns parsed config", () => {
    process.env.INCIDENT_RCA_PROVIDER = "openai";
    process.env.INCIDENT_RCA_API_KEY = "sk-y";
    process.env.INCIDENT_RCA_MODEL = "gpt-4o";
    expect(getRcaConfig()).toEqual({
      kind: "openai",
      apiKey: "sk-y",
      model: "gpt-4o",
    });
  });
});
