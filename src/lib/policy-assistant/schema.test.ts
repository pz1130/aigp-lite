import { describe, it, expect } from "vitest";
import {
  llmOutputSchema,
  generationResultSchema,
  testCaseSchema,
} from "./schema";

const validOutput = {
  name: "Block credit cards",
  description: "Block prompts containing full credit-card numbers.",
  ruleJson: { regex_match: [{ var: ["text"] }, "\\d{13,19}"] },
  severity: "high",
  enforcementMode: "block",
  scope: "input",
  tests: [
    {
      text: "card 4111 1111 1111 1111",
      shouldHit: true,
      reason: "positive case",
    },
    { text: "hello", shouldHit: false, reason: "negative case" },
    { text: "1234567890123", shouldHit: true, reason: "min-length boundary" },
  ],
};

describe("llmOutputSchema", () => {
  it("accepts a valid output", () => {
    expect(llmOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it("rejects when missing required fields", () => {
    const { name: _n, ...withoutName } = validOutput;
    expect(llmOutputSchema.safeParse(withoutName).success).toBe(false);
  });

  it("rejects unknown enum values", () => {
    expect(
      llmOutputSchema.safeParse({ ...validOutput, severity: "extreme" })
        .success,
    ).toBe(false);
    expect(
      llmOutputSchema.safeParse({ ...validOutput, enforcementMode: "ban" })
        .success,
    ).toBe(false);
    expect(
      llmOutputSchema.safeParse({ ...validOutput, scope: "anywhere" }).success,
    ).toBe(false);
  });

  it("rejects tests not exactly 3 long", () => {
    expect(
      llmOutputSchema.safeParse({
        ...validOutput,
        tests: validOutput.tests.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      llmOutputSchema.safeParse({
        ...validOutput,
        tests: [...validOutput.tests, validOutput.tests[0]],
      }).success,
    ).toBe(false);
  });
});

describe("testCaseSchema", () => {
  it("requires reason 1..200 chars", () => {
    expect(
      testCaseSchema.safeParse({ text: "x", shouldHit: true, reason: "" })
        .success,
    ).toBe(false);
    expect(
      testCaseSchema.safeParse({
        text: "x",
        shouldHit: true,
        reason: "a".repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe("generationResultSchema", () => {
  it("accepts each status value", () => {
    for (const status of ["ok", "needs_review", "failed"] as const) {
      const r = generationResultSchema.safeParse({ ...validOutput, status });
      expect(r.success).toBe(true);
    }
  });

  it("accepts optional diagnostics", () => {
    const r = generationResultSchema.safeParse({
      ...validOutput,
      status: "needs_review",
      diagnostics: [
        {
          kind: "self_check_miss",
          testIndex: 1,
          message: "expected true got false",
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
