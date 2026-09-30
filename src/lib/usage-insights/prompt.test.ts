import { describe, it, expect } from "vitest";
import {
  buildClusterSystemPrompt,
  buildClusterUserMessage,
  buildExecSummaryPrompt,
} from "./prompt";
import { computeStats } from "./stats";

describe("cluster prompt", () => {
  it("system prompt forbids verbatim snippets and demands JSON", () => {
    const s = buildClusterSystemPrompt();
    expect(s).toMatch(/JSON/);
    expect(s.toLowerCase()).toMatch(/no verbatim|do not quote|no snippet/);
  });
  it("user message summarizes count without leaking raw text verbatim label", () => {
    const msg = buildClusterUserMessage([
      { text: "scrubbed a", toolName: "search", outcome: "success" },
      { text: "scrubbed b", toolName: "search", outcome: "error" },
    ]);
    expect(msg).toContain("2");
    expect(msg).toContain("search");
  });
});

describe("exec summary prompt", () => {
  it("builds system + user", () => {
    const stats = computeStats([], { clusteredCount: 0, longTailCount: 0 });
    const { system, user } = buildExecSummaryPrompt(
      [{ label: "Data lookups", count: 5 }],
      stats,
    );
    expect(system).toMatch(/execSummary/);
    expect(user).toContain("Data lookups");
  });
});
