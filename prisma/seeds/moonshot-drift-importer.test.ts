import { describe, it, expect } from "vitest";
import { buildBenchmarkSeed } from "./moonshot-drift-importer";

describe("buildBenchmarkSeed", () => {
  it("maps json rows to DriftPrompt-shaped seed rows", () => {
    const out = buildBenchmarkSeed({
      name: "Moonshot QA",
      threshold: 7,
      prompts: [
        {
          promptText: "Q1",
          expectedBehavior: "answers",
          referenceOutput: "A1",
        },
      ],
    });
    expect(out.prompts[0].sortOrder).toBe(0);
    expect(out.prompts[0].promptText).toBe("Q1");
  });
});
