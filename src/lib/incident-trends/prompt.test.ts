import { describe, it, expect } from "vitest";
import {
  buildClusterSystemPrompt,
  buildClusterUserMessage,
  buildExecSummaryPrompt,
} from "./prompt";
import { computeStats } from "./stats";

describe("cluster prompts", () => {
  it("system prompt demands strict JSON with the four fields", () => {
    const sys = buildClusterSystemPrompt();
    expect(sys).toMatch(/JSON/);
    for (const f of [
      "label",
      "narrative",
      "systemicRecommendation",
      "confidence",
    ]) {
      expect(sys).toContain(f);
    }
  });

  it("user message lists each incident and includes RCA summary when present", () => {
    const msg = buildClusterUserMessage([
      {
        title: "Leak via tool output",
        category: "data_leak",
        severity: "high",
        rootCause: "unfiltered tool response",
        usecaseName: "Chatbot",
        rcaSummary: "Tool returned PII",
      },
    ]);
    expect(msg).toContain("Leak via tool output");
    expect(msg).toContain("data_leak");
    expect(msg).toContain("Tool returned PII");
  });
});

describe("exec summary prompt", () => {
  it("includes cluster labels and headline totals", () => {
    const stats = computeStats(
      [
        {
          category: "data_leak",
          severity: "high",
          status: "open",
          usecaseId: "u1",
          usecaseName: "Chatbot",
          frameworkRefs: {},
        },
      ],
      { clusteredCount: 1, longTailCount: 0 },
    );
    const { system, user } = buildExecSummaryPrompt(
      [{ label: "Prompt injection", memberCount: 4 }],
      stats,
    );
    expect(system).toMatch(/executive/i);
    expect(user).toContain("Prompt injection");
    expect(user).toContain("1"); // total incidents
  });
});
