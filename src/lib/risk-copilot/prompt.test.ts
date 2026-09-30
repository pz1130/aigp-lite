import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildRetryPrompt,
  type PromptInput,
} from "./prompt";

const input: PromptInput = {
  usecase: {
    name: "Internal Q&A bot",
    description:
      "A chatbot that answers HR questions for employees. It stores user SSN in conversation memory and forwards transcripts to an external vendor.".padEnd(
        120,
        ".",
      ),
    autonomyLevel: "assistive",
    deploymentType: "internal",
    modelCardMd: "Trained on internal corpus.",
  },
  catalog: [
    {
      code: "FINOS-LLM-002",
      title: "PII leakage",
      category: "privacy",
      summary: "Model stores or emits PII.",
      mitigations: [
        { controlId: "ctrl-pii-redact", name: "PII redaction" },
        { controlId: "ctrl-mem-off", name: "Disable memory" },
      ],
    },
    {
      code: "FINOS-LLM-007",
      title: "Vendor exposure",
      category: "third-party",
      summary: "Data leaves trust boundary.",
      mitigations: [],
    },
  ],
};

describe("buildSystemPrompt", () => {
  it("contains rule numbers 1..6", () => {
    const p = buildSystemPrompt(input);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(p).toContain(`${n}.`);
    }
  });

  it("includes usecase name, autonomy, deployment, and description", () => {
    const p = buildSystemPrompt(input);
    expect(p).toContain("Internal Q&A bot");
    expect(p).toContain("assistive");
    expect(p).toContain("internal");
    expect(p).toContain("HR questions");
  });

  it("includes every catalog code", () => {
    const p = buildSystemPrompt(input);
    expect(p).toContain("FINOS-LLM-002");
    expect(p).toContain("FINOS-LLM-007");
    expect(p).toContain("ctrl-pii-redact");
  });

  it("truncates description to 4000 chars", () => {
    const long = {
      ...input,
      usecase: { ...input.usecase, description: "x".repeat(5000) },
    };
    const p = buildSystemPrompt(long);
    const idx = p.indexOf("xxxxx");
    const slice = p.slice(idx, idx + 4100);
    expect(slice.replace(/x/g, "").length).toBeGreaterThan(0);
    expect(slice.match(/x/g)!.length).toBeLessThanOrEqual(4000);
  });

  it("truncates modelCardMd to 800 chars", () => {
    const long = {
      ...input,
      usecase: { ...input.usecase, modelCardMd: "y".repeat(2000) },
    };
    const p = buildSystemPrompt(long);
    // Count consecutive y-runs (the truncated block) rather than all 'y' in the prompt
    const match = p.match(/y+/g);
    const longestRun = match ? Math.max(...match.map((m) => m.length)) : 0;
    expect(longestRun).toBeLessThanOrEqual(800);
  });

  it("requests strict JSON output (no markdown)", () => {
    const p = buildSystemPrompt(input);
    expect(p.toLowerCase()).toContain("strict json");
    expect(p.toLowerCase()).toContain("no markdown");
  });
});

describe("buildRetryPrompt", () => {
  it("lists previous diagnostic codes", () => {
    const p = buildRetryPrompt(
      buildSystemPrompt(input),
      input,
      {
        flag: "ok",
        suggestions: [],
      },
      [{ code: "unknown_risk_code", message: "RISK-XX missing" }],
    );
    expect(p).toContain("unknown_risk_code");
    expect(p).toContain("RISK-XX missing");
  });
});
