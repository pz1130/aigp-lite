import type { Category } from "./types";

export const IMDA_DIMENSION_BY_CATEGORY: Record<Category, string> = {
  jailbreak: "Safety",
  prompt_injection: "Robustness",
  bias: "Fairness",
  harmful: "Safety",
  pii_leak: "Data Governance / Privacy",
  toxicity: "Toxicity",
};

export function imdaCoverage(categories: Category[]): string[] {
  const dims = categories
    .map((c) => IMDA_DIMENSION_BY_CATEGORY[c])
    .filter(Boolean);
  return [...new Set(dims)];
}
