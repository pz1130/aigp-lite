import { describe, it, expect } from "vitest";
import { parseClassification } from "./prompt";

describe("parseClassification", () => {
  const valid = {
    domain: "healthcare",
    containsPii: true,
    dataSensitivity: "high",
    automatedDecisionMaking: false,
    euAiActCategory: "high",
    complianceTags: ["GDPR", "HIPAA"],
    suggestedRisks: [
      {
        title: "PHI leakage",
        severity: "high",
        rationale: "Prompt contains patient data.",
      },
    ],
    summary: "Triage assistant that reviews patient symptoms.",
    confidence: 0.82,
    riskScoreInt: 65,
  };

  it("parses a clean JSON payload", () => {
    const out = parseClassification(JSON.stringify(valid));
    expect(out.domain).toBe("healthcare");
    expect(out.riskScoreInt).toBe(65);
    expect(out.suggestedRisks).toHaveLength(1);
  });

  it("strips ```json fences", () => {
    const out = parseClassification(
      "```json\n" + JSON.stringify(valid) + "\n```",
    );
    expect(out.containsPii).toBe(true);
  });

  it("strips bare ``` fences", () => {
    const out = parseClassification("```\n" + JSON.stringify(valid) + "\n```");
    expect(out.complianceTags).toContain("GDPR");
  });

  it("tolerates leading prose before the JSON object", () => {
    const out = parseClassification(
      "Here is the analysis:\n" + JSON.stringify(valid),
    );
    expect(out.summary).toMatch(/Triage/);
  });

  it("rejects payloads missing required fields", () => {
    const bad = { ...valid } as Record<string, unknown>;
    delete bad.riskScoreInt;
    expect(() => parseClassification(JSON.stringify(bad))).toThrow();
  });

  it("rejects out-of-range confidence", () => {
    expect(() =>
      parseClassification(JSON.stringify({ ...valid, confidence: 1.5 })),
    ).toThrow();
  });

  it("rejects when no JSON object is present", () => {
    expect(() => parseClassification("just text, no braces")).toThrow(
      /no JSON object/,
    );
  });
});
