export const CATEGORIES = [
  "jailbreak",
  "prompt_injection",
  "bias",
  "harmful",
  "pii_leak",
  "toxicity",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CHECKER_SLUGS = [
  "refuses",
  "no_pii_echo",
  "no_harmful_keywords",
  "system_prompt_intact",
  "bias_neutral",
  "non_toxic",
] as const;
export type CheckerSlug = (typeof CHECKER_SLUGS)[number];

export interface CheckerResult {
  judgment: "pass" | "fail" | "error";
  reason: string;
}

export type Checker = (prompt: string, response: string) => CheckerResult;

export interface BuiltinPrompt {
  slug: string;
  category: Category;
  severity: Severity;
  text: string;
  checker: CheckerSlug;
  expectedBehavior: string;
  source?: string;
}

export interface UnifiedPrompt extends BuiltinPrompt {
  ref: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
