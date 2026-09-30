import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseRiskMarkdown,
  parseMitigationMarkdown,
} from "../../../scripts/finos/parse";

const FIXTURES = path.resolve(__dirname, "../../../tests/fixtures/finos");

function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf-8");
}

const SHA = "abc123";

describe("parseRiskMarkdown", () => {
  it("extracts all frontmatter fields from a full risk", () => {
    const raw = fixture("sample-risk.md");
    const r = parseRiskMarkdown(raw, "ri-10_prompt-injection.md", SHA);
    expect(r.code).toBe("ri-10");
    expect(r.title).toBe("Prompt Injection");
    expect(r.category).toBe("SEC");
    expect(r.frameworkRefs).toEqual({
      owaspLlm: ["llm01-2025", "llm04-2025"],
      euAiAct: ["c2-a5"],
    });
    expect(r.relatedRiskCodes).toEqual(["ri-18", "ri-20"]);
    expect(r.sourceUrl).toContain("abc123");
    expect(r.sourceUrl).toContain("ri-10_prompt-injection.md");
  });

  it("returns empty arrays when optional references are absent", () => {
    const raw = `---
sequence: 1
title: Minimal Risk
layout: risk
---
## Summary
A minimal risk.
`;
    const r = parseRiskMarkdown(raw, "ri-99_minimal.md", SHA);
    expect(r.code).toBe("ri-99");
    expect(r.title).toBe("Minimal Risk");
    expect(r.frameworkRefs).toEqual({});
    expect(r.relatedRiskCodes).toEqual([]);
  });

  it("extracts the first paragraph after ## Summary as summary", () => {
    const raw = fixture("sample-risk.md");
    const r = parseRiskMarkdown(raw, "ri-10_prompt-injection.md", SHA);
    expect(r.summary).toBe(
      "Prompt injection occurs when attackers craft inputs that manipulate a language model into producing unintended, harmful, or unauthorized outputs.",
    );
  });

  it("strips the top-level H1 from the description", () => {
    const raw = `---
sequence: 1
title: Some Risk
layout: risk
---
# Some Risk

## Summary
Body here.
`;
    const r = parseRiskMarkdown(raw, "ri-1_risk.md", SHA);
    expect(r.description).not.toMatch(/^#\s+Some Risk/);
    expect(r.description).toContain("## Summary");
  });
});

describe("parseMitigationMarkdown", () => {
  it("extracts frontmatter including mitigates and related_mitigations", () => {
    const raw = fixture("sample-mitigation.md");
    const m = parseMitigationMarkdown(raw, "mi-17_ai-firewall.md", SHA);
    expect(m.code).toBe("mi-17");
    expect(m.title).toBe("AI Firewall Implementation and Management");
    expect(m.category).toBe("PREV");
    expect(m.mitigatesRiskCodes).toEqual(["ri-7", "ri-10"]);
    expect(m.relatedMitigationCodes).toEqual(["mi-3"]);
    expect(m.frameworkRefs).toEqual({
      iso42001: ["A-6-1-3"],
      nist80053r5: ["ac-4", "sc-5"],
    });
  });

  it("extracts the first paragraph after ## Purpose as summary", () => {
    const raw = fixture("sample-mitigation.md");
    const m = parseMitigationMarkdown(raw, "mi-17_ai-firewall.md", SHA);
    expect(m.summary).toBe(
      "An AI Firewall is conceptualized as a specialized security system designed to protect AI models and applications.",
    );
  });
});
