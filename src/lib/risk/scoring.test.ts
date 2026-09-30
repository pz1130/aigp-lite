import { describe, it, expect } from "vitest";
import {
  ControlSeverity,
  ControlStatusValue,
  RiskLevel,
  scoreUsecase,
} from "./scoring";

describe("risk scoring", () => {
  it("assistant alone → level low", () => {
    const result = scoreUsecase("assistant", []);
    expect(result.level).toBe<RiskLevel>("low");
  });

  it("agent_ecosystem alone → level high", () => {
    const result = scoreUsecase("agent_ecosystem", []);
    expect(result.level).toBe<RiskLevel>("high");
  });

  it("simple_agent with 2 failed high-severity controls → scoreInt > 30", () => {
    const controls = [
      {
        id: "1",
        status: "failed" as ControlStatusValue,
        severity: "high" as ControlSeverity,
        name: "",
        description: "",
      },
      {
        id: "2",
        status: "failed" as ControlStatusValue,
        severity: "high" as ControlSeverity,
        name: "",
        description: "",
      },
    ];
    const result = scoreUsecase("simple_agent", controls);
    expect(result.scoreInt).toBeGreaterThan(30);
  });

  it("collaborative_agent with 5 satisfied high-severity controls → scoreInt less than baseline", () => {
    const controls = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      status: "satisfied" as ControlStatusValue,
      severity: "high" as ControlSeverity,
      name: "",
      description: "",
    }));
    const result = scoreUsecase("collaborative_agent", controls);
    const baselineResult = scoreUsecase("collaborative_agent", []);
    expect(result.scoreInt).toBeLessThan(baselineResult.scoreInt);
  });
});
