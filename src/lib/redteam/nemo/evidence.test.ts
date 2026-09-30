import { describe, it, expect } from "vitest";
import { buildEvidenceRow } from "./evidence";
import type { HitlDemoResult } from "./hitl-demo";

const demo: HitlDemoResult = {
  approvalGate: { passed: true, detail: "needs approval" },
  killSwitch: { passed: true, detail: "halted" },
  transcript: [],
  ranAt: "2026-06-19T00:00:00.000Z",
};

describe("buildEvidenceRow", () => {
  it("maps a demo result to a NemoGuardrailEvidence create payload", () => {
    const row = buildEvidenceRow({
      orgId: "org1",
      userId: "u1",
      obligationCode: "ART-14",
      configRef: "nemo-configs/hitl-killswitch",
      demo,
    });
    expect(row.orgId).toBe("org1");
    expect(row.obligationCode).toBe("ART-14");
    expect(row.approvalGatePassed).toBe(true);
    expect(row.killSwitchPassed).toBe(true);
    expect(row.createdBy).toBe("u1");
  });
});
