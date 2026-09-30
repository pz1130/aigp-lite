import type { Severity } from "../types";
import { catalogByRecipe } from "./recipe-catalog";

export function scoreBand(_score: number): Severity | undefined {
  return undefined;
}

export function deriveSeverity(recipeId: string, score?: number): Severity {
  if (typeof score === "number") {
    const band = scoreBand(score);
    if (band) return band;
  }
  return catalogByRecipe(recipeId)?.baselineSeverity ?? "medium";
}
