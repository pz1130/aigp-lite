import { describe, it, expect } from "vitest";
import { DEFAULT_BINDING, requiredBlockingChecks } from "./safeguard-binding";
import { READINESS_CHECK_IDS } from "@/lib/dossier/readiness";

describe("requiredBlockingChecks", () => {
  it("returns empty for null and tier 0", () => {
    expect(requiredBlockingChecks(null)).toEqual(new Set());
    expect(requiredBlockingChecks(0)).toEqual(new Set());
  });

  it("returns tier-2 set", () => {
    expect(requiredBlockingChecks(2)).toEqual(
      new Set(["redteam", "external_redteam", "fria"]),
    );
  });

  it("tier 3 is a superset of tier 2", () => {
    const t2 = requiredBlockingChecks(2);
    const t3 = requiredBlockingChecks(3);
    for (const id of t2) expect(t3.has(id)).toBe(true);
    expect(t3.size).toBeGreaterThan(t2.size);
  });

  it("uses the highest defined tier when above max", () => {
    expect(requiredBlockingChecks(99)).toEqual(requiredBlockingChecks(3));
  });
});

describe("DEFAULT_BINDING ids", () => {
  it("references only existing readiness check ids", () => {
    const ids = new Set(READINESS_CHECK_IDS);
    for (const bound of Object.values(DEFAULT_BINDING).flat()) {
      expect(ids.has(bound)).toBe(true);
    }
  });
});
