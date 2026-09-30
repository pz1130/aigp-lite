import { describe, it, expect } from "vitest";
import { validateSuggestions, type ValidateInput } from "./validate";

const baseCatalog = new Map<string, { mitigationIds: Set<string> }>([
  [
    "FINOS-LLM-002",
    { mitigationIds: new Set(["ctrl-pii-redact", "ctrl-mem-off"]) },
  ],
  ["FINOS-LLM-007", { mitigationIds: new Set([]) }],
]);

const baseUsecase = {
  description: "A chatbot that stores user SSN in conversation memory.",
  modelCardMd: "Notes on training.",
};

function item(
  over: Partial<
    Parameters<typeof validateSuggestions>[0]["raw"]["suggestions"][number]
  > = {},
) {
  return {
    riskCode: "FINOS-LLM-002",
    severity: "high" as const,
    rationale:
      "The usecase stores user SSN which violates the privacy control.",
    evidenceQuote: "stores user SSN in conversation memory",
    mitigationIds: ["ctrl-pii-redact"],
    ...over,
  };
}

function input(overSugg: ReturnType<typeof item>[]): ValidateInput {
  return {
    raw: { flag: "ok", suggestions: overSugg },
    catalog: baseCatalog,
    usecase: baseUsecase,
  };
}

describe("validateSuggestions", () => {
  it("passes a clean item through unchanged", () => {
    const r = validateSuggestions(input([item()]));
    expect(r.items).toHaveLength(1);
    expect(r.diagnostics).toHaveLength(0);
  });

  it("filters items with unknown riskCode and emits diagnostic", () => {
    const r = validateSuggestions(input([item({ riskCode: "RISK-XX" })]));
    expect(r.items).toHaveLength(0);
    expect(
      r.diagnostics.find((d) => d.code === "unknown_risk_code"),
    ).toBeTruthy();
  });

  it("filters items whose evidenceQuote is not in description/modelCard", () => {
    const r = validateSuggestions(
      input([item({ evidenceQuote: "hallucinated quote not present" })]),
    );
    expect(r.items).toHaveLength(0);
    expect(
      r.diagnostics.find((d) => d.code === "hallucinated_quote"),
    ).toBeTruthy();
  });

  it("matches evidenceQuote case-insensitively and whitespace-collapsed", () => {
    const r = validateSuggestions(
      input([
        item({ evidenceQuote: "STORES   user ssn   in conversation memory" }),
      ]),
    );
    expect(r.items).toHaveLength(1);
  });

  it("filters invalid mitigationIds but keeps item if any valid remain (or empty)", () => {
    const r = validateSuggestions(
      input([item({ mitigationIds: ["ctrl-pii-redact", "bogus"] })]),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].mitigationIds).toEqual(["ctrl-pii-redact"]);
    expect(
      r.diagnostics.find((d) => d.code === "invalid_mitigation"),
    ).toBeTruthy();
  });

  it("dedupes same riskCode keeping higher severity", () => {
    const r = validateSuggestions(
      input([
        item({ severity: "low" }),
        item({
          severity: "critical",
          evidenceQuote: "stores user SSN in conversation memory",
        }),
      ]),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].severity).toBe("critical");
    expect(r.diagnostics.find((d) => d.code === "duplicate_risk")).toBeTruthy();
  });
});
