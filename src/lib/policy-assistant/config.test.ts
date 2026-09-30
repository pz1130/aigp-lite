import { describe, it, expect, beforeEach } from "vitest";
import {
  isAssistantEnabled,
  getDailyLimit,
  getAssistantProvider,
} from "./config";

const ENV_KEYS = [
  "AIGP_ASSISTANT_ENABLED",
  "AIGP_ASSISTANT_DAILY_LIMIT",
  "AIGP_ASSISTANT_PROVIDER",
  "AIGP_ASSISTANT_ANTHROPIC_KEY",
  "AIGP_ASSISTANT_ANTHROPIC_MODEL",
  "AIGP_ASSISTANT_OPENAI_KEY",
  "AIGP_ASSISTANT_OPENAI_MODEL",
  "AIGP_ASSISTANT_GOOGLE_KEY",
  "AIGP_ASSISTANT_GOOGLE_MODEL",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("isAssistantEnabled", () => {
  it("returns false when env unset", () => {
    expect(isAssistantEnabled()).toBe(false);
  });
  it("returns true only when env exactly 'true'", () => {
    process.env.AIGP_ASSISTANT_ENABLED = "true";
    expect(isAssistantEnabled()).toBe(true);
    process.env.AIGP_ASSISTANT_ENABLED = "yes";
    expect(isAssistantEnabled()).toBe(false);
  });
});

describe("getDailyLimit", () => {
  it("defaults to 20 when unset", () => {
    expect(getDailyLimit()).toBe(20);
  });
  it("parses env override", () => {
    process.env.AIGP_ASSISTANT_DAILY_LIMIT = "50";
    expect(getDailyLimit()).toBe(50);
  });
  it("falls back to 20 on garbage env", () => {
    process.env.AIGP_ASSISTANT_DAILY_LIMIT = "abc";
    expect(getDailyLimit()).toBe(20);
    process.env.AIGP_ASSISTANT_DAILY_LIMIT = "0";
    expect(getDailyLimit()).toBe(20);
    process.env.AIGP_ASSISTANT_DAILY_LIMIT = "-5";
    expect(getDailyLimit()).toBe(20);
  });
});

describe("getAssistantProvider", () => {
  it("defaults to anthropic", () => {
    process.env.AIGP_ASSISTANT_ANTHROPIC_KEY = "sk-ant-test";
    const r = getAssistantProvider();
    expect(r.kind).toBe("anthropic");
    expect(r.apiKey).toBe("sk-ant-test");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
  });

  it("routes to openai", () => {
    process.env.AIGP_ASSISTANT_PROVIDER = "openai";
    process.env.AIGP_ASSISTANT_OPENAI_KEY = "sk-openai-test";
    const r = getAssistantProvider();
    expect(r.kind).toBe("openai");
    expect(r.apiKey).toBe("sk-openai-test");
    expect(r.model).toBe("gpt-4o-mini");
  });

  it("routes to google", () => {
    process.env.AIGP_ASSISTANT_PROVIDER = "google";
    process.env.AIGP_ASSISTANT_GOOGLE_KEY = "google-key";
    const r = getAssistantProvider();
    expect(r.kind).toBe("google");
    expect(r.model).toBe("gemini-2.5-flash");
  });

  it("respects model override env", () => {
    process.env.AIGP_ASSISTANT_ANTHROPIC_KEY = "sk";
    process.env.AIGP_ASSISTANT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
    expect(getAssistantProvider().model).toBe("claude-sonnet-4-6");
  });

  it("throws when key missing for selected provider", () => {
    process.env.AIGP_ASSISTANT_PROVIDER = "anthropic";
    expect(() => getAssistantProvider()).toThrow(
      /AIGP_ASSISTANT_ANTHROPIC_KEY/,
    );
  });

  it("throws on unknown provider", () => {
    process.env.AIGP_ASSISTANT_PROVIDER = "bogus";
    expect(() => getAssistantProvider()).toThrow(
      /Unknown AIGP_ASSISTANT_PROVIDER/,
    );
  });
});
