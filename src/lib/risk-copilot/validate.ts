import type { LlmOutput, SuggestionItem, Diagnostic } from "./schema";

export type CatalogIndex = Map<string, { mitigationIds: Set<string> }>;

export type ValidateInput = {
  raw: LlmOutput;
  catalog: CatalogIndex;
  usecase: { description: string; modelCardMd: string };
};

export type ValidateResult = {
  items: SuggestionItem[];
  diagnostics: Diagnostic[];
};

const SEVERITY_RANK: Record<SuggestionItem["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function validateSuggestions(input: ValidateInput): ValidateResult {
  const haystack = normalise(
    `${input.usecase.description} ${input.usecase.modelCardMd}`,
  );
  const diagnostics: Diagnostic[] = [];
  const surviving: SuggestionItem[] = [];

  for (const sugg of input.raw.suggestions) {
    const cat = input.catalog.get(sugg.riskCode);
    if (!cat) {
      diagnostics.push({
        code: "unknown_risk_code",
        message: `riskCode "${sugg.riskCode}" is not in the catalog`,
      });
      continue;
    }

    const needle = normalise(sugg.evidenceQuote);
    if (!haystack.includes(needle)) {
      diagnostics.push({
        code: "hallucinated_quote",
        message: `evidenceQuote for "${sugg.riskCode}" is not present in usecase`,
      });
      continue;
    }

    const filtered = sugg.mitigationIds.filter((id) =>
      cat.mitigationIds.has(id),
    );
    if (filtered.length !== sugg.mitigationIds.length) {
      const dropped = sugg.mitigationIds.filter(
        (id) => !cat.mitigationIds.has(id),
      );
      diagnostics.push({
        code: "invalid_mitigation",
        message: `dropped mitigation ids for "${sugg.riskCode}": ${dropped.join(", ")}`,
      });
    }

    surviving.push({ ...sugg, mitigationIds: filtered });
  }

  const deduped = new Map<string, SuggestionItem>();
  for (const s of surviving) {
    const existing = deduped.get(s.riskCode);
    if (!existing) {
      deduped.set(s.riskCode, s);
      continue;
    }
    diagnostics.push({
      code: "duplicate_risk",
      message: `duplicate suggestion for "${s.riskCode}"`,
    });
    if (SEVERITY_RANK[s.severity] > SEVERITY_RANK[existing.severity]) {
      deduped.set(s.riskCode, s);
    }
  }

  return { items: [...deduped.values()], diagnostics };
}
