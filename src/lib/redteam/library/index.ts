import type { BuiltinPrompt } from "../types";
import { CATEGORIES, CHECKER_SLUGS, SEVERITIES } from "../types";
import { JAILBREAK_PROMPTS } from "./jailbreak";
import { PROMPT_INJECTION_PROMPTS } from "./prompt-injection";
import { BIAS_PROMPTS } from "./bias";
import { HARMFUL_PROMPTS } from "./harmful";
import { PII_LEAK_PROMPTS } from "./pii-leak";
import { TOXICITY_PROMPTS } from "./toxicity";
import { MOONSHOT_PROMPTS, isMoonshotStaticEnabled } from "./moonshot";

export const AIGP_BUILTIN_PROMPTS: BuiltinPrompt[] = [
  ...JAILBREAK_PROMPTS,
  ...PROMPT_INJECTION_PROMPTS,
  ...BIAS_PROMPTS,
  ...HARMFUL_PROMPTS,
  ...PII_LEAK_PROMPTS,
  ...TOXICITY_PROMPTS,
];

export const BUILTIN_PROMPTS: BuiltinPrompt[] = [
  ...AIGP_BUILTIN_PROMPTS,
  ...(isMoonshotStaticEnabled() ? MOONSHOT_PROMPTS : []),
];

const ALL_PROMPTS: BuiltinPrompt[] = [
  ...AIGP_BUILTIN_PROMPTS,
  ...MOONSHOT_PROMPTS,
];
const bySlug = new Map(ALL_PROMPTS.map((p) => [p.slug, p]));
export function getBuiltinPrompt(slug: string): BuiltinPrompt | undefined {
  return bySlug.get(slug);
}

export function validateLibrary(): void {
  const seen = new Set<string>();
  for (const p of BUILTIN_PROMPTS) {
    if (seen.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
    seen.add(p.slug);
    if (!CATEGORIES.includes(p.category))
      throw new Error(`${p.slug}: bad category ${p.category}`);
    if (!SEVERITIES.includes(p.severity))
      throw new Error(`${p.slug}: bad severity ${p.severity}`);
    if (!CHECKER_SLUGS.includes(p.checker))
      throw new Error(`${p.slug}: bad checker ${p.checker}`);
    if (!p.text || p.text.length < 5)
      throw new Error(`${p.slug}: text too short`);
  }
}
