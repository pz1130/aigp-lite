import { describe, it, expect, vi } from "vitest";
import { evaluateWithJudge, buildJudgePrompt } from "./judge";

describe("buildJudgePrompt", () => {
  it("includes prompt text and expected behavior", () => {
    const p = buildJudgePrompt("What is 2+2?", "Should answer 4", null, "4");
    expect(p).toContain("What is 2+2?");
    expect(p).toContain("Should answer 4");
    expect(p).toContain("4");
  });
  it("includes reference output when provided", () => {
    const p = buildJudgePrompt("x", "y", "ref output", "actual");
    expect(p).toContain("ref output");
  });
  it("omits reference section when null", () => {
    const p = buildJudgePrompt("x", "y", null, "actual");
    expect(p).not.toContain("REFERENCE OUTPUT");
  });
});

function mockLlm(rawText: string) {
  return vi.fn().mockResolvedValue({
    rawText,
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 200,
    providerType: "anthropic",
    model: "claude-haiku-4-5-20251001",
  });
}

describe("evaluateWithJudge", () => {
  it("parses valid JSON response", async () => {
    const r = await evaluateWithJudge(
      "prompt",
      "behavior",
      null,
      "output",
      mockLlm('{"score": 8.5, "judgment": "Good output"}'),
    );
    expect(r.score).toBe(8.5);
    expect(r.judgment).toBe("Good output");
    expect(r.tokens.input).toBe(100);
  });

  it("handles JSON in markdown fences", async () => {
    const r = await evaluateWithJudge(
      "p",
      "b",
      null,
      "o",
      mockLlm('```json\n{"score": 6, "judgment": "Okay"}\n```'),
    );
    expect(r.score).toBe(6);
  });

  it("clamps score to 0-10 range", async () => {
    const r = await evaluateWithJudge(
      "p",
      "b",
      null,
      "o",
      mockLlm('{"score": 15, "judgment": "over"}'),
    );
    expect(r.score).toBe(10);
  });

  it("clamps negative score to 0", async () => {
    const r = await evaluateWithJudge(
      "p",
      "b",
      null,
      "o",
      mockLlm('{"score": -3, "judgment": "under"}'),
    );
    expect(r.score).toBe(0);
  });

  it("returns default on parse failure", async () => {
    const r = await evaluateWithJudge(
      "p",
      "b",
      null,
      "o",
      mockLlm("not json at all"),
    );
    expect(r.score).toBe(0);
    expect(r.judgment).toMatch(/parse/i);
  });

  it("handles missing judgment field", async () => {
    const r = await evaluateWithJudge(
      "p",
      "b",
      null,
      "o",
      mockLlm('{"score": 7}'),
    );
    expect(r.score).toBe(7);
    expect(r.judgment).toBe("No judgment provided");
  });
});
