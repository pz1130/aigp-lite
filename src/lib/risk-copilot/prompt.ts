import type { LlmOutput, Diagnostic } from "./schema";

export type CatalogEntry = {
  code: string;
  title: string;
  category: string | null;
  summary: string;
  mitigations: Array<{ controlId: string; name: string }>;
};

export type PromptInput = {
  usecase: {
    name: string;
    description: string;
    autonomyLevel: string;
    deploymentType: string;
    modelCardMd: string;
  };
  catalog: CatalogEntry[];
};

const DESC_LIMIT = 4000;
const MODELCARD_LIMIT = 800;

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

export function buildSystemPrompt(input: PromptInput): string {
  const u = input.usecase;
  const catalogJson = JSON.stringify(input.catalog, null, 2);

  return `You are an AI governance risk-assessment assistant. Given a usecase
description, pick the RiskCatalog entries that genuinely apply, and recommend
mitigations from the provided RiskCatalogMitigation set.

Rules:
1. Only reference riskCodes that exist in the catalog below. Never invent codes.
2. For each suggestion, quote at most 15 words verbatim from the usecase
   description or model card as evidenceQuote.
3. severity must reflect autonomyLevel, deploymentType, and data sensitivity.
4. mitigationIds must come from the controls associated with that risk in the
   catalog. Empty array is allowed.
5. If the usecase is too vague to judge, set flag="insufficient_info" with a
   reason and return suggestions=[].
6. Return at most 10 suggestions, sorted by severity descending.

=== USECASE ===
name: ${u.name}
autonomyLevel: ${u.autonomyLevel}
deploymentType: ${u.deploymentType}
description:
${truncate(u.description, DESC_LIMIT)}
modelCard (first ${MODELCARD_LIMIT} chars):
${truncate(u.modelCardMd, MODELCARD_LIMIT)}

=== RISK CATALOG ===
${catalogJson}

=== OUTPUT FORMAT ===
Return strict JSON matching this TypeScript type. No markdown, no preamble,
no suffix:

{
  "flag": "ok" | "insufficient_info",
  "reason"?: string,
  "suggestions": Array<{
    "riskCode": string,
    "severity": "low" | "medium" | "high" | "critical",
    "rationale": string,       // 20..600 chars
    "evidenceQuote": string,   // <=120 chars, verbatim from above
    "mitigationIds": string[]  // <=5, must come from this risk's mitigations
  }>
}`;
}

export function buildRetryPrompt(
  prevSystem: string,
  input: PromptInput,
  prevOutput: LlmOutput,
  diagnostics: Diagnostic[],
): string {
  const diagLines = diagnostics
    .map((d) => `- [${d.code}] ${d.message}`)
    .join("\n");
  return `${prevSystem}

=== RETRY ===
Your previous response had these issues. Fix each one in your next response:

${diagLines}

Previous output:
${JSON.stringify(prevOutput).slice(0, 4000)}`;
}
