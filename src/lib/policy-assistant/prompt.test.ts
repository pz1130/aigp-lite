import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildRetryPrompt } from "./prompt";
import { SAMPLE_POLICIES } from "@/lib/policy-engine/samples";
import type { LlmOutput } from "./schema";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("declares the role", () => {
    expect(prompt).toMatch(/AIGP-Lite/);
  });

  it("lists all three custom operators", () => {
    expect(prompt).toMatch(/regex_match/);
    expect(prompt).toMatch(/length_gt/);
    expect(prompt).toMatch(/contains_any/);
  });

  it("includes all 5 sample policy names as few-shot examples", () => {
    for (const s of SAMPLE_POLICIES) {
      expect(prompt).toContain(s.name);
    }
  });

  it("constrains output to JSON (no markdown prose)", () => {
    expect(prompt.toLowerCase()).toMatch(/json/);
    expect(prompt.toLowerCase()).toMatch(/no markdown|no prose|only json/);
  });

  it("requires exactly 3 tests with at least one positive and one negative", () => {
    expect(prompt).toMatch(/exactly 3|3 tests/i);
    expect(prompt).toMatch(/shouldHit/);
  });
});

describe("buildRetryPrompt", () => {
  const prior = "PRIOR SYSTEM PROMPT";
  const attempted: LlmOutput = {
    name: "x",
    description: "y",
    ruleJson: { foo: 1 },
    severity: "high",
    enforcementMode: "block",
    scope: "input",
    tests: [
      { text: "a", shouldHit: true, reason: "p" },
      { text: "b", shouldHit: false, reason: "n" },
      { text: "c", shouldHit: true, reason: "e" },
    ],
  };
  const diagnostics = [
    {
      kind: "self_check_miss" as const,
      testIndex: 0,
      message: "expected true got false",
    },
  ];

  const retry = buildRetryPrompt(
    prior,
    "user input here",
    attempted,
    diagnostics,
  );

  it("includes the prior system prompt content", () => {
    expect(retry).toContain(prior);
  });

  it("includes the previous attempt JSON", () => {
    expect(retry).toContain('"name": "x"');
  });

  it("includes diagnostic messages", () => {
    expect(retry).toMatch(/expected true got false/);
  });
});
