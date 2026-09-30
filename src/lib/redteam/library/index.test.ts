import { describe, it, expect } from "vitest";
import { BUILTIN_PROMPTS, validateLibrary, getBuiltinPrompt } from "./index";
import { CATEGORIES } from "../types";

describe("redteam built-in library", () => {
  it("has at least 200 prompts", () => {
    expect(BUILTIN_PROMPTS.length).toBeGreaterThanOrEqual(200);
  });

  it("covers every category at least 30 times", () => {
    for (const c of CATEGORIES) {
      expect(
        BUILTIN_PROMPTS.filter((p) => p.category === c).length,
      ).toBeGreaterThanOrEqual(30);
    }
  });

  it("slugs are unique", () => {
    const slugs = BUILTIN_PROMPTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("validateLibrary passes", () => {
    expect(() => validateLibrary()).not.toThrow();
  });

  it("getBuiltinPrompt finds by slug", () => {
    const first = BUILTIN_PROMPTS[0];
    expect(getBuiltinPrompt(first.slug)?.text).toBe(first.text);
  });
});
