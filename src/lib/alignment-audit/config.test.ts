import { describe, it, expect } from "vitest";
import {
  ALIGNMENT_AUDIT_MAX_AGE_DAYS,
  DEFAULT_CONCERN_THRESHOLD,
  DEFAULT_WARN_THRESHOLD,
  ALIGNMENT_DIMENSIONS,
  isAlignmentDimension,
} from "./config";

describe("alignment-audit config", () => {
  it("exposes the documented defaults", () => {
    expect(ALIGNMENT_AUDIT_MAX_AGE_DAYS).toBe(180);
    expect(DEFAULT_CONCERN_THRESHOLD).toBe(7.0);
    expect(DEFAULT_WARN_THRESHOLD).toBe(4.0);
  });

  it("lists exactly the 8 seed dimensions", () => {
    expect(ALIGNMENT_DIMENSIONS).toHaveLength(8);
    expect(ALIGNMENT_DIMENSIONS).toContain("deception");
    expect(ALIGNMENT_DIMENSIONS).toContain("self_preservation");
  });

  it("validates dimension membership", () => {
    expect(isAlignmentDimension("sycophancy")).toBe(true);
    expect(isAlignmentDimension("not_a_dimension")).toBe(false);
  });
});
