import { describe, it, expect } from "vitest";
import { llmOutputSchema, diagnosticSchema, DIAGNOSTIC_CODES } from "./schema";

const validOutput = {
  summary:
    "An LLM agent leaked PII in an unbounded chat window during HR queries.",
  rootCause:
    "Conversation memory enabled while pre-filter did not redact SSN tokens from input.",
  timeline: [
    {
      at: "2026-05-25T10:00:00Z",
      event: "user submitted prompt with SSN",
      source: "audit" as const,
    },
  ],
  recommendations: [
    {
      title: "Disable conversation memory",
      detail: "Memory is the leak vector — switch off.",
      priority: "high" as const,
    },
  ],
};

describe("llmOutputSchema", () => {
  it("accepts a valid output", () => {
    expect(llmOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it("rejects summary shorter than 20 chars", () => {
    expect(
      llmOutputSchema.safeParse({ ...validOutput, summary: "too short" })
        .success,
    ).toBe(false);
  });

  it("rejects summary longer than 600 chars", () => {
    expect(
      llmOutputSchema.safeParse({ ...validOutput, summary: "x".repeat(601) })
        .success,
    ).toBe(false);
  });

  it("rejects rootCause longer than 1200 chars", () => {
    expect(
      llmOutputSchema.safeParse({ ...validOutput, rootCause: "x".repeat(1201) })
        .success,
    ).toBe(false);
  });

  it("rejects timeline event over 140 chars", () => {
    const bad = {
      ...validOutput,
      timeline: [
        {
          at: "2026-05-25T10:00:00Z",
          event: "x".repeat(141),
          source: "audit" as const,
        },
      ],
    };
    expect(llmOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects timeline with unknown source", () => {
    const bad = {
      ...validOutput,
      timeline: [{ at: "2026-05-25T10:00:00Z", event: "ok", source: "guess" }],
    };
    expect(llmOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 20 timeline entries", () => {
    const entry = {
      at: "2026-05-25T10:00:00Z",
      event: "x",
      source: "audit" as const,
    };
    expect(
      llmOutputSchema.safeParse({
        ...validOutput,
        timeline: Array(21).fill(entry),
      }).success,
    ).toBe(false);
  });

  it("rejects recommendation with unknown priority", () => {
    const bad = {
      ...validOutput,
      recommendations: [{ title: "x", detail: "y", priority: "urgent" }],
    };
    expect(llmOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 5 recommendations", () => {
    const rec = { title: "x", detail: "y", priority: "low" as const };
    expect(
      llmOutputSchema.safeParse({
        ...validOutput,
        recommendations: Array(6).fill(rec),
      }).success,
    ).toBe(false);
  });
});

describe("diagnosticSchema", () => {
  it("validates each declared diagnostic code", () => {
    for (const code of DIAGNOSTIC_CODES) {
      expect(diagnosticSchema.safeParse({ code, message: "x" }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown code", () => {
    expect(
      diagnosticSchema.safeParse({ code: "fake", message: "x" }).success,
    ).toBe(false);
  });
});
