import { describe, it, expect } from "vitest";
import { evaluateSubmission } from "./submission";
import { signRenderedAt } from "./anti-abuse";

const NOW = 1_000_000_000_000;
const goodBody = (over: Record<string, unknown> = {}) => ({
  type: "vulnerability",
  title: "Prompt injection in summarizer",
  description: "Detailed description of the jailbreak.",
  reproSteps: "1. do x",
  renderedAt: signRenderedAt(NOW - 5000),
  website: "",
  ...over,
});

describe("evaluateSubmission", () => {
  it("accepts a valid, human-timed submission", () => {
    const r = evaluateSubmission(goodBody(), NOW);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.data.type).toBe("vulnerability");
  });

  it("silently drops when the honeypot is filled", () => {
    expect(evaluateSubmission(goodBody({ website: "bot" }), NOW).kind).toBe(
      "silent",
    );
  });

  it("silently drops when filled too fast", () => {
    const body = goodBody({ renderedAt: signRenderedAt(NOW - 1000) });
    expect(evaluateSubmission(body, NOW).kind).toBe("silent");
  });

  it("silently drops when renderedAt signature is forged", () => {
    expect(
      evaluateSubmission(goodBody({ renderedAt: `${NOW - 5000}.forged` }), NOW)
        .kind,
    ).toBe("silent");
  });

  it("rejects out-of-bounds fields as invalid", () => {
    expect(evaluateSubmission(goodBody({ title: "" }), NOW).kind).toBe(
      "invalid",
    );
    expect(
      evaluateSubmission(goodBody({ description: "x".repeat(8001) }), NOW).kind,
    ).toBe("invalid");
    expect(evaluateSubmission(goodBody({ type: "spam" }), NOW).kind).toBe(
      "invalid",
    );
  });

  it("accepts usage_violation type and optional email", () => {
    const r = evaluateSubmission(
      goodBody({ type: "usage_violation", reporterEmail: "a@b.com" }),
      NOW,
    );
    expect(r.kind).toBe("ok");
  });
});
