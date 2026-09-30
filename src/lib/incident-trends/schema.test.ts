import { describe, it, expect } from "vitest";
import { clusterOutputSchema, execSummarySchema } from "./schema";

describe("clusterOutputSchema", () => {
  it("accepts a well-formed cluster output", () => {
    const ok = clusterOutputSchema.safeParse({
      label: "Prompt injection attempts",
      narrative:
        "Multiple incidents share a jailbreak pattern targeting the system prompt.",
      systemicRecommendation:
        "Add an input-scope policy and enable the prompt-injection red-team suite org-wide.",
      confidence: "high",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an invalid confidence and empty label", () => {
    expect(
      clusterOutputSchema.safeParse({
        label: "",
        narrative: "x".repeat(30),
        systemicRecommendation: "y".repeat(30),
        confidence: "certain",
      }).success,
    ).toBe(false);
  });
});

describe("execSummarySchema", () => {
  it("requires a non-trivial summary", () => {
    expect(
      execSummarySchema.safeParse({ execSummary: "too short" }).success,
    ).toBe(false);
    expect(
      execSummarySchema.safeParse({ execSummary: "x".repeat(40) }).success,
    ).toBe(true);
  });
});
