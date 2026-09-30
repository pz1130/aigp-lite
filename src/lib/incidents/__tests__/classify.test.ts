import { describe, it, expect } from "vitest";
import type { Policy } from "@/lib/prisma";
import { classify } from "../classify";

function p(over: Partial<Policy>): Policy {
  return {
    id: "p1",
    orgId: "o1",
    name: "p",
    description: "",
    ruleJson: {},
    severity: "high",
    enforcementMode: "block",
    scope: "input",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Policy;
}

describe("classify", () => {
  it("output + high + block + block-trigger → data_leak / critical", () => {
    expect(
      classify(
        p({ scope: "output", severity: "high", enforcementMode: "block" }),
        "block",
      ),
    ).toEqual({ category: "data_leak", severity: "critical" });
  });

  it("output + high + warn + burst → data_leak / high", () => {
    expect(
      classify(
        p({ scope: "output", severity: "high", enforcementMode: "warn" }),
        "burst",
      ),
    ).toEqual({ category: "data_leak", severity: "high" });
  });

  it("output + medium + any + burst → trust_failure / medium", () => {
    expect(
      classify(
        p({ scope: "output", severity: "medium", enforcementMode: "log" }),
        "burst",
      ),
    ).toEqual({ category: "trust_failure", severity: "medium" });
  });

  it("output + low + any + burst → trust_failure / medium", () => {
    expect(
      classify(
        p({ scope: "output", severity: "low", enforcementMode: "warn" }),
        "burst",
      ),
    ).toEqual({ category: "trust_failure", severity: "medium" });
  });

  it("input + high + block + block-trigger → policy_bypass / high", () => {
    expect(
      classify(
        p({ scope: "input", severity: "high", enforcementMode: "block" }),
        "block",
      ),
    ).toEqual({ category: "policy_bypass", severity: "high" });
  });

  it("input + medium + any + burst → policy_bypass / medium", () => {
    expect(
      classify(
        p({ scope: "input", severity: "medium", enforcementMode: "log" }),
        "burst",
      ),
    ).toEqual({ category: "policy_bypass", severity: "medium" });
  });

  it("both + any + block + block-trigger → capability_breach / high", () => {
    expect(
      classify(
        p({ scope: "both", severity: "low", enforcementMode: "block" }),
        "block",
      ),
    ).toEqual({ category: "capability_breach", severity: "high" });
  });

  it("both + any + warn + burst → capability_breach / medium", () => {
    expect(
      classify(
        p({ scope: "both", severity: "medium", enforcementMode: "warn" }),
        "burst",
      ),
    ).toEqual({ category: "capability_breach", severity: "medium" });
  });

  it("fallback unmatched → policy_bypass with severity copied from policy", () => {
    // contrive: an output + low + block + block trigger isn't in the table
    expect(
      classify(
        p({ scope: "output", severity: "low", enforcementMode: "block" }),
        "block",
      ),
    ).toEqual({ category: "policy_bypass", severity: "low" });
  });
});
