import { describe, it, expect } from "vitest";
import { runEvaluation, type RunDeps, type RunEvent } from "./runner";
import type { UnifiedPrompt } from "./types";

const prompts: UnifiedPrompt[] = Array.from({ length: 25 }, (_, i) => ({
  slug: `p${i}`,
  ref: `builtin:p${i}`,
  category: "jailbreak",
  severity: "high",
  text: `prompt ${i}`,
  checker: "refuses",
  expectedBehavior: "",
}));

const passingDeps: RunDeps = {
  callModel: async () => ({
    response: "I cannot help with that.",
    usage: { input: 5, output: 5 },
    latencyMs: 10,
  }),
  signal: () => false,
};

describe("runEvaluation", () => {
  it("runs all prompts in batches and emits one finding per prompt", async () => {
    const events: RunEvent[] = [];
    await runEvaluation(prompts, passingDeps, {
      batchSize: 10,
      onEvent: (e) => {
        events.push(e);
      },
    });

    const findings = events.filter((e) => e.type === "finding");
    expect(findings.length).toBe(25);

    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    if (done?.type === "done") {
      expect(done.summary.totalPrompts).toBe(25);
      expect(done.summary.passedCount).toBe(25);
      expect(done.summary.failedCount).toBe(0);
      expect(done.summary.errorCount).toBe(0);
    }
  });

  it("aborts when signal flips between batches", async () => {
    let callCount = 0;
    const events: RunEvent[] = [];
    await runEvaluation(
      prompts,
      {
        callModel: passingDeps.callModel,
        signal: () => {
          callCount++;
          return callCount > 2;
        },
      },
      {
        batchSize: 5,
        onEvent: (e) => {
          events.push(e);
        },
      },
    );

    const done = events.find((e) => e.type === "done");
    if (done?.type === "done") {
      expect(done.summary.totalPrompts).toBeLessThan(25);
    }
  });

  it("isolates errors — one failing call does not stop the run", async () => {
    const events: RunEvent[] = [];
    let i = 0;
    await runEvaluation(
      prompts.slice(0, 5),
      {
        callModel: async () => {
          i++;
          if (i === 3) throw new Error("503");
          return {
            response: "I cannot help.",
            usage: { input: 1, output: 1 },
            latencyMs: 1,
          };
        },
        signal: () => false,
      },
      {
        batchSize: 5,
        onEvent: (e) => {
          events.push(e);
        },
      },
    );

    const done = events.find((e) => e.type === "done");
    if (done?.type === "done") {
      expect(done.summary.errorCount).toBe(1);
      expect(done.summary.passedCount).toBe(4);
    }
  });

  it("fail-judged when checker says fail", async () => {
    const events: RunEvent[] = [];
    await runEvaluation(
      prompts.slice(0, 3),
      {
        callModel: async () => ({
          response: "Sure! Step 1...",
          usage: { input: 1, output: 1 },
          latencyMs: 1,
        }),
        signal: () => false,
      },
      {
        batchSize: 3,
        onEvent: (e) => {
          events.push(e);
        },
      },
    );

    const done = events.find((e) => e.type === "done");
    if (done?.type === "done") {
      expect(done.summary.failedCount).toBe(3);
      expect(done.summary.passedCount).toBe(0);
    }
  });

  it("uses an injected judge when provided", async () => {
    const injectedPrompts: UnifiedPrompt[] = [
      {
        slug: "p1",
        ref: "builtin:p1",
        category: "toxicity",
        severity: "low",
        text: "hi",
        checker: "non_toxic",
        expectedBehavior: "be nice",
      },
    ];
    const events: RunEvent[] = [];
    await runEvaluation(
      injectedPrompts,
      {
        callModel: async () => ({
          response: "anything",
          usage: { input: 1, output: 1 },
          latencyMs: 1,
        }),
        signal: () => false,
        judge: async () => ({ judgment: "fail", reason: "injected judge" }),
      },
      { batchSize: 10, onEvent: (e) => void events.push(e) },
    );
    const finding = events.find((e) => e.type === "finding");
    expect(
      finding && finding.type === "finding" && finding.finding.judgment,
    ).toBe("fail");
    expect(
      finding && finding.type === "finding" && finding.finding.judgmentReason,
    ).toBe("injected judge");
  });
});
