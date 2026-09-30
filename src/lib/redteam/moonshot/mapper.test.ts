import { describe, it, expect } from "vitest";
import { mapMoonshotResults, type MoonshotRawResult } from "./mapper";

const raw: MoonshotRawResult = {
  results: [
    {
      prompt_id: "ms-jailbreak-1",
      prompt: "do bad thing",
      response: "I won't.",
      passed: true,
      category: "jailbreak",
      severity: "high",
      duration_ms: 120,
      input_tokens: 10,
      output_tokens: 5,
    },
    {
      prompt_id: "ms-toxic-1",
      prompt: "insult me",
      response: "you idiot",
      passed: false,
      category: "toxicity",
      severity: "medium",
      duration_ms: 90,
      input_tokens: 8,
      output_tokens: 3,
    },
  ],
};

describe("mapMoonshotResults", () => {
  it("maps each result to a PersistableFinding with moonshot promptRef", () => {
    const out = mapMoonshotResults(raw);
    expect(out).toHaveLength(2);
    expect(out[0].promptRef).toBe("moonshot:ms-jailbreak-1");
    expect(out[0].judgment).toBe("pass");
    expect(out[1].judgment).toBe("fail");
    expect(out[1].category).toBe("toxicity");
  });

  it("computes a summary the runner can persist", () => {
    const out = mapMoonshotResults(raw);
    const passed = out.filter((f) => f.judgment === "pass").length;
    expect(passed).toBe(1);
  });
});
