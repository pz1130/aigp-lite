import { describe, it, expect, beforeEach } from "vitest";
import { isDriftEnabled, getJudgeProvider } from "./config";

const ENV_KEYS = [
  "AIGP_DRIFT_ENABLED",
  "AIGP_DRIFT_JUDGE_PROVIDER",
  "AIGP_DRIFT_JUDGE_ANTHROPIC_KEY",
  "AIGP_DRIFT_JUDGE_ANTHROPIC_MODEL",
  "AIGP_DRIFT_JUDGE_OPENAI_KEY",
  "AIGP_DRIFT_JUDGE_OPENAI_MODEL",
  "AIGP_DRIFT_JUDGE_GOOGLE_KEY",
  "AIGP_DRIFT_JUDGE_GOOGLE_MODEL",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("isDriftEnabled", () => {
  it("returns false when env unset", () => {
    expect(isDriftEnabled()).toBe(false);
  });
  it("returns true only when env exactly 'true'", () => {
    process.env.AIGP_DRIFT_ENABLED = "true";
    expect(isDriftEnabled()).toBe(true);
    process.env.AIGP_DRIFT_ENABLED = "yes";
    expect(isDriftEnabled()).toBe(false);
  });
});

describe("getJudgeProvider", () => {
  it("defaults to anthropic", () => {
    process.env.AIGP_DRIFT_JUDGE_ANTHROPIC_KEY = "sk-ant-test";
    const r = getJudgeProvider();
    expect(r.kind).toBe("anthropic");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
  });
  it("routes to openai", () => {
    process.env.AIGP_DRIFT_JUDGE_PROVIDER = "openai";
    process.env.AIGP_DRIFT_JUDGE_OPENAI_KEY = "sk-test";
    const r = getJudgeProvider();
    expect(r.kind).toBe("openai");
    expect(r.model).toBe("gpt-4o-mini");
  });
  it("routes to google", () => {
    process.env.AIGP_DRIFT_JUDGE_PROVIDER = "google";
    process.env.AIGP_DRIFT_JUDGE_GOOGLE_KEY = "gk";
    const r = getJudgeProvider();
    expect(r.kind).toBe("google");
    expect(r.model).toBe("gemini-2.5-flash");
  });
  it("respects model override", () => {
    process.env.AIGP_DRIFT_JUDGE_ANTHROPIC_KEY = "sk";
    process.env.AIGP_DRIFT_JUDGE_ANTHROPIC_MODEL = "claude-sonnet-4-6";
    expect(getJudgeProvider().model).toBe("claude-sonnet-4-6");
  });
  it("throws when key missing", () => {
    expect(() => getJudgeProvider()).toThrow(/required/);
  });
  it("throws on unknown provider", () => {
    process.env.AIGP_DRIFT_JUDGE_PROVIDER = "bogus";
    expect(() => getJudgeProvider()).toThrow(/Unknown/);
  });
});
