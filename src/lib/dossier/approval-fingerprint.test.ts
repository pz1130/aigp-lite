import { describe, it, expect } from "vitest";
import {
  approvalFingerprintDrifted,
  approvalNeedsReReview,
  formatModelRef,
} from "./approval-fingerprint";

describe("formatModelRef", () => {
  it('returns "none" when version is missing', () => {
    expect(formatModelRef(null)).toBe("none");
    expect(formatModelRef(undefined)).toBe("none");
  });
  it("returns the version string when present", () => {
    expect(formatModelRef("v2.1")).toBe("v2.1");
  });
});

describe("approvalFingerprintDrifted", () => {
  it("returns false for legacy rows without bound metadata", () => {
    expect(
      approvalFingerprintDrifted(
        { boundTier: null, boundModelRef: null },
        { effectiveTier: 3, modelRef: "v9" },
      ),
    ).toBe(false);
  });

  it("detects tier drift", () => {
    expect(
      approvalFingerprintDrifted(
        { boundTier: 1, boundModelRef: "v1" },
        { effectiveTier: 2, modelRef: "v1" },
      ),
    ).toBe(true);
  });

  it("detects model drift", () => {
    expect(
      approvalFingerprintDrifted(
        { boundTier: 2, boundModelRef: "v1" },
        { effectiveTier: 2, modelRef: "v2" },
      ),
    ).toBe(true);
  });

  it("returns false when fingerprint matches", () => {
    expect(
      approvalFingerprintDrifted(
        { boundTier: 0, boundModelRef: "none" },
        { effectiveTier: 0, modelRef: "none" },
      ),
    ).toBe(false);
  });
});

describe("approvalNeedsReReview", () => {
  it("is true when staleApproval is already set", () => {
    expect(
      approvalNeedsReReview(
        {
          status: "live",
          boundTier: 1,
          boundModelRef: "v1",
          staleApproval: true,
        },
        { effectiveTier: 1 },
        "v1",
      ),
    ).toBe(true);
  });

  it("is false for rejected decisions", () => {
    expect(
      approvalNeedsReReview(
        {
          status: "rejected",
          boundTier: 1,
          boundModelRef: "v1",
          staleApproval: false,
        },
        { effectiveTier: 3 },
        "v9",
      ),
    ).toBe(false);
  });
});
