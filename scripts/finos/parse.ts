import matter from "gray-matter";

const FRAMEWORK_KEY_MAP: Record<string, string> = {
  "owasp-llm_references": "owaspLlm",
  "eu-ai-act_references": "euAiAct",
  "nist-sp-800-53r5_references": "nist80053r5",
  "iso-42001_references": "iso42001",
  "ffiec-itbooklets_references": "ffiecItbooklets",
};

export type FinosRisk = {
  code: string;
  title: string;
  category?: string;
  summary: string;
  description: string;
  frameworkRefs: Record<string, string[]>;
  relatedRiskCodes: string[];
  sourceUrl: string;
};

export type FinosMitigation = {
  code: string;
  title: string;
  category?: string;
  summary: string;
  description: string;
  frameworkRefs: Record<string, string[]>;
  mitigatesRiskCodes: string[];
  relatedMitigationCodes: string[];
  sourceUrl: string;
};

function codeFromFilename(filename: string): string {
  // "ri-10_prompt-injection.md" → "ri-10"
  const stem = filename.replace(/\.md$/, "");
  return stem.split("_")[0];
}

function extractFrameworkRefs(
  fm: Record<string, unknown>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [yamlKey, jsonKey] of Object.entries(FRAMEWORK_KEY_MAP)) {
    const v = fm[yamlKey];
    if (Array.isArray(v) && v.length > 0) {
      out[jsonKey] = v.map(String);
    }
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function stripTopH1(body: string): string {
  return body.replace(/^\s*#\s+[^\n]+\n+/, "");
}

function firstParagraphAfter(body: string, headingRegex: RegExp): string {
  const m = body.match(headingRegex);
  if (!m) return "";
  const start = (m.index ?? 0) + m[0].length;
  const rest = body.slice(start).replace(/^\s+/, "");
  const para = rest.split(/\n\s*\n/)[0] ?? "";
  return para.trim().slice(0, 1000);
}

function sourceUrl(
  kind: "risks" | "mitigations",
  filename: string,
  sha: string,
): string {
  return `https://github.com/finos/ai-governance-framework/blob/${sha}/docs/_${kind}/${filename}`;
}

export function parseRiskMarkdown(
  raw: string,
  filename: string,
  sha: string,
): FinosRisk {
  const parsed = matter(raw);
  const fm = parsed.data;
  const body = stripTopH1(parsed.content);
  return {
    code: codeFromFilename(filename),
    title: String(fm.title ?? ""),
    category: fm.type ? String(fm.type) : undefined,
    summary: firstParagraphAfter(body, /^##\s+Summary\s*\n/m),
    description: body.trim(),
    frameworkRefs: extractFrameworkRefs(fm),
    relatedRiskCodes: asStringArray(fm.related_risks),
    sourceUrl: sourceUrl("risks", filename, sha),
  };
}

export function parseMitigationMarkdown(
  raw: string,
  filename: string,
  sha: string,
): FinosMitigation {
  const parsed = matter(raw);
  const fm = parsed.data;
  const body = stripTopH1(parsed.content);
  return {
    code: codeFromFilename(filename),
    title: String(fm.title ?? ""),
    category: fm.type ? String(fm.type) : undefined,
    summary: firstParagraphAfter(body, /^##\s+Purpose\s*\n/m),
    description: body.trim(),
    frameworkRefs: extractFrameworkRefs(fm),
    mitigatesRiskCodes: asStringArray(fm.mitigates),
    relatedMitigationCodes: asStringArray(fm.related_mitigations),
    sourceUrl: sourceUrl("mitigations", filename, sha),
  };
}
