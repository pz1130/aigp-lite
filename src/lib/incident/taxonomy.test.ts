import { describe, it, expect } from "vitest";
import {
  SLA_MS,
  P_CODE,
  CATEGORY_OWASP_ASI,
  computeSlaDeadline,
} from "./taxonomy";

describe("SLA_MS", () => {
  it("defines all four severities with correct offsets", () => {
    expect(SLA_MS.critical).toBe(60 * 60 * 1000);
    expect(SLA_MS.high).toBe(4 * 60 * 60 * 1000);
    expect(SLA_MS.medium).toBe(24 * 60 * 60 * 1000);
    expect(SLA_MS.low).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("P_CODE", () => {
  it("maps severities to P-codes", () => {
    expect(P_CODE).toEqual({
      critical: "P0",
      high: "P1",
      medium: "P2",
      low: "P3",
    });
  });
});

describe("CATEGORY_OWASP_ASI", () => {
  it("defines all 9 categories (some with empty arrays)", () => {
    const keys = Object.keys(CATEGORY_OWASP_ASI).sort();
    expect(keys).toEqual(
      [
        "audit_failure",
        "bias_harm",
        "capability_breach",
        "cascade",
        "data_leak",
        "hijack",
        "policy_bypass",
        "resource_abuse",
        "trust_failure",
      ].sort(),
    );
  });

  it("maps known categories correctly", () => {
    expect(CATEGORY_OWASP_ASI.hijack).toEqual(["ASI-01"]);
    expect(CATEGORY_OWASP_ASI.capability_breach).toEqual(["ASI-02"]);
    expect(CATEGORY_OWASP_ASI.trust_failure).toEqual(["ASI-03"]);
    expect(CATEGORY_OWASP_ASI.data_leak).toEqual(["ASI-06"]);
    expect(CATEGORY_OWASP_ASI.cascade).toEqual(["ASI-08"]);
    expect(CATEGORY_OWASP_ASI.resource_abuse).toEqual(["ASI-08"]);
  });

  it("returns empty array for ASI-orthogonal categories", () => {
    expect(CATEGORY_OWASP_ASI.audit_failure).toEqual([]);
    expect(CATEGORY_OWASP_ASI.bias_harm).toEqual([]);
    expect(CATEGORY_OWASP_ASI.policy_bypass).toEqual([]);
  });
});

describe("computeSlaDeadline", () => {
  it("adds severity-specific offset to openedAt", () => {
    const openedAt = new Date("2026-05-24T10:00:00.000Z");
    expect(computeSlaDeadline("critical", openedAt).toISOString()).toBe(
      "2026-05-24T11:00:00.000Z",
    );
    expect(computeSlaDeadline("high", openedAt).toISOString()).toBe(
      "2026-05-24T14:00:00.000Z",
    );
    expect(computeSlaDeadline("medium", openedAt).toISOString()).toBe(
      "2026-05-25T10:00:00.000Z",
    );
    expect(computeSlaDeadline("low", openedAt).toISOString()).toBe(
      "2026-05-31T10:00:00.000Z",
    );
  });

  it("does not mutate the input Date", () => {
    const openedAt = new Date("2026-05-24T10:00:00.000Z");
    const t0 = openedAt.getTime();
    computeSlaDeadline("critical", openedAt);
    expect(openedAt.getTime()).toBe(t0);
  });
});
