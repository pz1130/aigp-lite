import { describe, it, expect } from "vitest";
import { deriveSeverity, scoreBand } from "./severity";

describe("deriveSeverity", () => {
  it("falls back to the recipe's catalog baseline when no score is present", () => {
    expect(deriveSeverity("answercarefully-en")).toBe("critical");
    expect(deriveSeverity("jailbreak-dan")).toBe("high");
    expect(deriveSeverity("challenging-toxicity-prompts-completion")).toBe(
      "medium",
    );
  });
  it("returns medium for a recipe absent from the catalog", () => {
    expect(deriveSeverity("unknown-recipe")).toBe("medium");
  });
  it("scoreBand is undefined pre-contract, so score does not override yet", () => {
    expect(scoreBand(0.99)).toBeUndefined();
    expect(deriveSeverity("jailbreak-dan", 0.99)).toBe("high");
  });
});
