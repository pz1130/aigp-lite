import { describe, it, expect } from "vitest";
import {
  llmOutputSchema,
  suggestionItemSchema,
  diagnosticSchema,
} from "./schema";

describe("risk-copilot schema", () => {
  const validItem = {
    riskCode: "FINOS-LLM-002",
    severity: "high" as const,
    rationale:
      "The usecase exposes sensitive PII through unbounded prompts which violates control.",
    evidenceQuote: "stores user SSN in conversation memory",
    mitigationIds: ["ctrl-pii-redact"],
  };

  it("accepts a well-formed suggestion item", () => {
    expect(suggestionItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("rejects unknown severity", () => {
    expect(
      suggestionItemSchema.safeParse({ ...validItem, severity: "extreme" })
        .success,
    ).toBe(false);
  });

  it("rejects rationale shorter than 20 chars", () => {
    expect(
      suggestionItemSchema.safeParse({ ...validItem, rationale: "too short" })
        .success,
    ).toBe(false);
  });

  it("rejects rationale longer than 600 chars", () => {
    expect(
      suggestionItemSchema.safeParse({
        ...validItem,
        rationale: "x".repeat(601),
      }).success,
    ).toBe(false);
  });

  it("rejects evidenceQuote over 120 chars", () => {
    expect(
      suggestionItemSchema.safeParse({
        ...validItem,
        evidenceQuote: "x".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("rejects more than 5 mitigationIds", () => {
    expect(
      suggestionItemSchema.safeParse({
        ...validItem,
        mitigationIds: ["a", "b", "c", "d", "e", "f"],
      }).success,
    ).toBe(false);
  });

  it("accepts ok output with 0..10 suggestions", () => {
    expect(
      llmOutputSchema.safeParse({ flag: "ok", suggestions: [] }).success,
    ).toBe(true);
    expect(
      llmOutputSchema.safeParse({
        flag: "ok",
        suggestions: Array(10).fill(validItem),
      }).success,
    ).toBe(true);
  });

  it("rejects more than 10 suggestions", () => {
    expect(
      llmOutputSchema.safeParse({
        flag: "ok",
        suggestions: Array(11).fill(validItem),
      }).success,
    ).toBe(false);
  });

  it("accepts insufficient_info flag with reason", () => {
    const r = llmOutputSchema.safeParse({
      flag: "insufficient_info",
      reason: "description is empty",
      suggestions: [],
    });
    expect(r.success).toBe(true);
  });

  it("diagnosticSchema validates known codes", () => {
    expect(
      diagnosticSchema.safeParse({
        code: "unknown_risk_code",
        message: "RISK-X not in catalog",
      }).success,
    ).toBe(true);
    expect(
      diagnosticSchema.safeParse({ code: "fake_code", message: "foo" }).success,
    ).toBe(false);
  });
});
