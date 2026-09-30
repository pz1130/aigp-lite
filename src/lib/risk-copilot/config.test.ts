import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isCopilotEnabled,
  getDailyLimit,
  getCopilotProvider,
  getCatalogTokenBudget,
} from "./config";

const ORIG = { ...process.env };

describe("risk-copilot config", () => {
  beforeEach(() => {
    process.env = { ...ORIG };
  });
  afterEach(() => {
    process.env = ORIG;
  });

  it("isCopilotEnabled defaults to false when no provider configured", () => {
    delete process.env.RISK_COPILOT_PROVIDER;
    delete process.env.RISK_COPILOT_API_KEY;
    expect(isCopilotEnabled()).toBe(false);
  });

  it("isCopilotEnabled true when provider + key are present", () => {
    process.env.RISK_COPILOT_PROVIDER = "anthropic";
    process.env.RISK_COPILOT_API_KEY = "sk-test";
    process.env.RISK_COPILOT_MODEL = "claude-opus-4-7";
    expect(isCopilotEnabled()).toBe(true);
  });

  it("getDailyLimit returns env or default 20", () => {
    delete process.env.RISK_COPILOT_DAILY_LIMIT;
    expect(getDailyLimit()).toBe(20);
    process.env.RISK_COPILOT_DAILY_LIMIT = "5";
    expect(getDailyLimit()).toBe(5);
  });

  it("getCatalogTokenBudget returns 40000 by default", () => {
    delete process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET;
    expect(getCatalogTokenBudget()).toBe(40000);
  });

  it("getCatalogTokenBudget honors a valid override", () => {
    process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET = "5000";
    expect(getCatalogTokenBudget()).toBe(5000);
  });

  it("getCatalogTokenBudget falls back to 40000 on invalid/zero/negative", () => {
    process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET = "abc";
    expect(getCatalogTokenBudget()).toBe(40000);
    process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET = "0";
    expect(getCatalogTokenBudget()).toBe(40000);
    process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET = "-10";
    expect(getCatalogTokenBudget()).toBe(40000);
  });

  it("getCopilotProvider throws when not configured", () => {
    delete process.env.RISK_COPILOT_PROVIDER;
    expect(() => getCopilotProvider()).toThrow();
  });

  it("getCopilotProvider returns config object", () => {
    process.env.RISK_COPILOT_PROVIDER = "anthropic";
    process.env.RISK_COPILOT_API_KEY = "sk-x";
    process.env.RISK_COPILOT_MODEL = "claude-opus-4-7";
    const cfg = getCopilotProvider();
    expect(cfg).toEqual({
      kind: "anthropic",
      apiKey: "sk-x",
      model: "claude-opus-4-7",
    });
  });
});
