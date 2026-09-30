import { describe, it, expect } from "vitest";
import { evaluate } from "./evaluate";
import type { PolicyDescriptor, EvalContext } from "./types";

describe("evaluate", () => {
  const basePolicy: PolicyDescriptor = {
    id: "pol-001",
    name: "Test Policy",
    ruleJson: { var: ["text"] },
    enforcementMode: "block",
    scope: "input",
    severity: "high",
  };

  const makeCtx = (overrides: Partial<EvalContext> = {}): EvalContext => ({
    scope: "input",
    text: "hello world",
    ...overrides,
  });

  it("input rule matches input scope", () => {
    const policies: PolicyDescriptor[] = [{ ...basePolicy }];
    const ctx = makeCtx({ scope: "input", text: "hello world" });
    const hits = evaluate(policies, ctx);
    expect(hits).toHaveLength(1);
    expect(hits[0].mode).toBe("block");
    expect(hits[0].policyId).toBe("pol-001");
  });

  it("input rule does not match output scope", () => {
    const policies: PolicyDescriptor[] = [{ ...basePolicy }];
    const ctx = makeCtx({ scope: "output", text: "hello world" });
    const hits = evaluate(policies, ctx);
    expect(hits).toHaveLength(0);
  });

  it("regex_match operator works", () => {
    const policies: PolicyDescriptor[] = [
      {
        id: "pol-regex",
        name: "SSN Detector",
        ruleJson: {
          and: [{ regex_match: [{ var: ["text"] }, "\\d{3}-\\d{2}-\\d{4}"] }],
        },
        enforcementMode: "block",
        scope: "input",
        severity: "high",
      },
    ];
    const ctx = makeCtx({ scope: "input", text: "My SSN is 123-45-6789" });
    const hits = evaluate(policies, ctx);
    expect(hits).toHaveLength(1);
    expect(hits[0].policyName).toBe("SSN Detector");
  });

  it("malformed rule is silently skipped", () => {
    const policies: PolicyDescriptor[] = [
      {
        id: "pol-malformed",
        name: "Malformed",
        ruleJson: { unknown_operator: ["text"] } as unknown,
        enforcementMode: "block",
        scope: "input",
        severity: "high",
      },
    ];
    const ctx = makeCtx({ scope: "input", text: "hello" });
    // Should not throw
    const hits = evaluate(policies, ctx);
    expect(hits).toHaveLength(0);
  });

  it("snippet is capped at 200 chars", () => {
    const longText = "A".repeat(300);
    const policies: PolicyDescriptor[] = [{ ...basePolicy }];
    const ctx = makeCtx({ scope: "input", text: longText });
    const hits = evaluate(policies, ctx);
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet.length).toBe(201); // 200 + "…"
    expect(hits[0].snippet.endsWith("…")).toBe(true);
  });
});
