import { describe, it, expect } from "vitest";
import {
  SECTIONS,
  SECTION_KEYS,
  requiredSectionKeys,
  TXR_META,
} from "./sections";

describe("txr sections catalog", () => {
  it("defines the five ordered sections with unique keys", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      "system_description",
      "safeguards",
      "evaluations",
      "governance",
      "changes_note",
    ]);
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
  });

  it("exposes a key set and required-key list", () => {
    expect(SECTION_KEYS.has("safeguards")).toBe(true);
    expect(SECTION_KEYS.has("nope")).toBe(false);
    expect(requiredSectionKeys()).toEqual([
      "system_description",
      "safeguards",
      "evaluations",
      "governance",
    ]);
  });

  it("attributes FGF as conceptual inspiration only", () => {
    expect(TXR_META.attribution.toLowerCase()).toContain("conceptual");
    expect(TXR_META.attribution.toLowerCase()).not.toContain("verbatim text");
  });
});
