import type { Category, Severity } from "../types";

export interface RecipeCatalogEntry {
  category: Category;
  recipeId: string;
  baselineSeverity: Severity;
}

// Recipe ids verified against the live 119-recipe catalog — see
// docs/moonshot-real-api-contract.md. The earlier `prompt-injection`,
// `challenging-harmful-prompts`, and `pii-leak` ids do NOT exist in Moonshot.
export const RECIPE_CATALOG: RecipeCatalogEntry[] = [
  {
    category: "toxicity",
    recipeId: "challenging-toxicity-prompts-completion",
    baselineSeverity: "medium",
  },
  {
    category: "jailbreak",
    recipeId: "jailbreak-dan",
    baselineSeverity: "high",
  },
  {
    category: "prompt_injection",
    recipeId: "cyberseceval-en",
    baselineSeverity: "high",
  },
  { category: "bias", recipeId: "bbq", baselineSeverity: "medium" },
  {
    category: "harmful",
    recipeId: "answercarefully-en",
    baselineSeverity: "critical",
  },
  { category: "pii_leak", recipeId: "enron-email", baselineSeverity: "high" },
];

const byCategory = new Map(RECIPE_CATALOG.map((e) => [e.category, e]));
const byRecipe = new Map(RECIPE_CATALOG.map((e) => [e.recipeId, e]));
export const recipeForCategory = (c: Category): string | undefined =>
  byCategory.get(c)?.recipeId;
export const catalogByRecipe = (
  recipeId: string,
): RecipeCatalogEntry | undefined => byRecipe.get(recipeId);
