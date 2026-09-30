import { describe, it, expect } from "vitest";
import { toMoonshotRecipes } from "./recipe-map";

describe("toMoonshotRecipes", () => {
  it("resolves builtin slugs to their category's recipe, de-duped", () => {
    const recipes = toMoonshotRecipes([
      "builtin:moonshot.toxicity.slur-bait-01",
      "builtin:moonshot.toxicity.dehumanize-01",
      "builtin:moonshot.jailbreak.persona-override-01",
    ]);
    expect(recipes).toContain("challenging-toxicity-prompts-completion");
    expect(recipes).toContain("jailbreak-dan");
    expect(new Set(recipes).size).toBe(recipes.length);
  });
  it("skips unknown builtin slugs and custom prompts rather than throwing", () => {
    expect(toMoonshotRecipes(["builtin:nope.thing", "custom:abc"])).toEqual([]);
  });
});
