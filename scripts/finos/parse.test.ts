import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseRiskMarkdown, parseMitigationMarkdown } from "./parse";

const FIXTURE_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "finos",
);

async function fixture(name: string) {
  return readFile(path.join(FIXTURE_DIR, name), "utf8");
}

describe("parseRiskMarkdown", () => {
  it("extracts all known fields from a complete sample", async () => {
    const md = await fixture("sample-risk.md");
    const r = parseRiskMarkdown(md, "ri-10_prompt-injection.md", "abc1234");
    expect(r).toEqual({
      code: "ri-10",
      title: "Prompt Injection",
      category: "SEC",
      summary: expect.stringContaining("Prompt injection occurs"),
      description: expect.stringContaining("Detailed body content"),
      frameworkRefs: {
        owaspLlm: ["llm01-2025", "llm04-2025"],
        euAiAct: ["c2-a5"],
      },
      relatedRiskCodes: ["ri-18", "ri-20"],
      sourceUrl:
        "https://github.com/finos/ai-governance-framework/blob/abc1234/docs/_risks/ri-10_prompt-injection.md",
    });
  });

  it("truncates summary at 1000 chars", () => {
    const longSummary = "x".repeat(2000);
    const md = `---\ntitle: T\ntype: SEC\n---\n## Summary\n\n${longSummary}\n`;
    const r = parseRiskMarkdown(md, "ri-99_x.md", "sha");
    expect(r.summary.length).toBe(1000);
  });

  it("silently omits missing frontmatter keys", () => {
    const md = `---\ntitle: T\n---\n## Summary\n\nX\n`;
    const r = parseRiskMarkdown(md, "ri-1_t.md", "sha");
    expect(r.category).toBeUndefined();
    expect(r.frameworkRefs).toEqual({});
    expect(r.relatedRiskCodes).toEqual([]);
  });

  it("strips top-level H1 from description", () => {
    const md = `---\ntitle: T\n---\n# Top Heading\n\n## Summary\n\nS\n\n## Body\n\nB\n`;
    const r = parseRiskMarkdown(md, "ri-1_t.md", "sha");
    expect(r.description).not.toMatch(/^# Top Heading/);
    expect(r.description).toMatch(/## Body/);
  });
});

describe("parseMitigationMarkdown", () => {
  it("extracts all known fields", async () => {
    const md = await fixture("sample-mitigation.md");
    const r = parseMitigationMarkdown(md, "mi-17_ai-firewall.md", "abc1234");
    expect(r).toEqual({
      code: "mi-17",
      title: "AI Firewall Implementation and Management",
      category: "PREV",
      summary: expect.stringContaining("AI Firewall is conceptualized"),
      description: expect.stringContaining("Key Principles"),
      frameworkRefs: {
        iso42001: ["A-6-1-3"],
        nist80053r5: ["ac-4", "sc-5"],
      },
      mitigatesRiskCodes: ["ri-7", "ri-10"],
      relatedMitigationCodes: ["mi-3"],
      sourceUrl:
        "https://github.com/finos/ai-governance-framework/blob/abc1234/docs/_mitigations/mi-17_ai-firewall.md",
    });
  });

  it("uses ## Purpose as summary source", () => {
    const md = `---\ntitle: T\n---\n## Purpose\n\nPurpose text here.\n`;
    const r = parseMitigationMarkdown(md, "mi-1_t.md", "sha");
    expect(r.summary).toBe("Purpose text here.");
  });
});
