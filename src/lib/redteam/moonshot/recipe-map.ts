import type { Category } from "../types";
import { getBuiltinPrompt } from "../library";
import { recipeForCategory } from "./recipe-catalog";

function categoryOf(promptSourceId: string): Category | undefined {
  if (promptSourceId.startsWith("builtin:")) {
    return getBuiltinPrompt(promptSourceId.slice("builtin:".length))?.category;
  }
  return undefined;
}

export function toMoonshotRecipes(promptSourceIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of promptSourceIds) {
    const cat = categoryOf(id);
    const recipe = cat && recipeForCategory(cat);
    if (recipe) out.add(recipe);
  }
  return [...out];
}
