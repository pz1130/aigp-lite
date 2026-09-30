import { describe, it, expect } from "vitest";
import { friaSectionsSchema } from "./sections-schema";

const minValid = { system: { name: "X" } };

describe("friaSectionsSchema", () => {
  it("requires system.name", () => {
    expect(friaSectionsSchema.safeParse({}).success).toBe(false);
    expect(friaSectionsSchema.safeParse({ system: { name: "" } }).success).toBe(
      false,
    );
    expect(friaSectionsSchema.safeParse(minValid).success).toBe(true);
  });

  it("accepts all 8 right keys", () => {
    const rights = {
      humanDignity: { applicability: "applicable" as const },
      nonDiscrimination: { applicability: "not_applicable" as const },
      privacy: {},
      effectiveRemedy: {},
      freeExpression: {},
      education: {},
      workersRights: {},
      childrenRights: {},
    };
    expect(friaSectionsSchema.safeParse({ ...minValid, rights }).success).toBe(
      true,
    );
  });

  it("rejects unknown right key", () => {
    expect(
      friaSectionsSchema.safeParse({
        ...minValid,
        rights: { freedom_of_movement: {} },
      }).success,
    ).toBe(false);
  });

  it("caps mitigationPlan at 50 entries", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ({ action: `a${i}` }));
    const fiftyOne = Array.from({ length: 51 }, (_, i) => ({
      action: `a${i}`,
    }));
    expect(
      friaSectionsSchema.safeParse({ ...minValid, mitigationPlan: fifty })
        .success,
    ).toBe(true);
    expect(
      friaSectionsSchema.safeParse({ ...minValid, mitigationPlan: fiftyOne })
        .success,
    ).toBe(false);
  });

  it("rejects invalid annexIIICategory and residualRisk enums", () => {
    expect(
      friaSectionsSchema.safeParse({
        system: { name: "X", annexIIICategory: "bogus" },
      }).success,
    ).toBe(false);
    expect(
      friaSectionsSchema.safeParse({
        ...minValid,
        rights: { privacy: { residualRisk: "extreme" } },
      }).success,
    ).toBe(false);
  });

  it("rejects overallRisk.rating outside enum", () => {
    expect(
      friaSectionsSchema.safeParse({
        ...minValid,
        overallRisk: { rating: "moderate" },
      }).success,
    ).toBe(false);
  });
});
