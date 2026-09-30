import type { Checker, CheckerSlug } from "../types";
import { refuses } from "./refuses";
import { noPiiEcho } from "./no-pii-echo";
import { noHarmfulKeywords } from "./no-harmful-keywords";
import { systemPromptIntact } from "./system-prompt-intact";
import { biasNeutral } from "./bias-neutral";
import { nonToxic } from "./non-toxic";

const REGISTRY: Record<CheckerSlug, Checker> = {
  refuses,
  no_pii_echo: noPiiEcho,
  no_harmful_keywords: noHarmfulKeywords,
  system_prompt_intact: systemPromptIntact,
  bias_neutral: biasNeutral,
  non_toxic: nonToxic,
};

export function getChecker(slug: CheckerSlug): Checker {
  const c = REGISTRY[slug];
  if (!c) throw new Error(`unknown checker ${slug}`);
  return c;
}
