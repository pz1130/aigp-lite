import { z } from "zod";

export const extractionSchema = z.array(
  z.object({
    code: z.string().min(1).max(50),
    title: z.string().min(1).max(200),
    description: z.string().max(5000).default(""),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
  }),
);

export type RawControl = z.infer<typeof extractionSchema>[number];

const SYSTEM_PROMPT = `You are a compliance and risk management expert. Given a document containing risk/compliance controls (from any framework — EU AI Act, NIST, ISO, or custom), extract every individual control requirement into a structured array.

For each control, provide:
- code: a short identifier (e.g. "Art.9", "GOVERN-1.1", "5.2", or generate one if missing)
- title: a concise title summarizing the control requirement (max 200 chars)
- description: the full control requirement text (max 5000 chars)
- severity: "low", "medium", or "high" based on the potential impact of non-compliance

Rules:
- Extract ALL controls, even if they seem minor
- If the document uses sections/articles/clauses, use those as codes
- If no explicit code exists, generate a sequential one like "CTRL-001"
- Be faithful to the source text — do not paraphrase away important details
- Respond with a JSON array only, no preface, no markdown fences`;

const SCHEMA_HINT = `[
  {
    "code": string,       // e.g. "Art.9", "CTRL-001", "GOVERN-1.1"
    "title": string,      // concise summary, max 200 chars
    "description": string, // full requirement text, max 5000 chars
    "severity": "low" | "medium" | "high"
  }
]`;

export function buildExtractPrompt(
  text: string,
  frameworkName: string,
): string {
  const truncated =
    text.length > 80_000
      ? text.slice(0, 80_000) + "\n\n[...truncated...]"
      : text;
  return [
    `Framework: ${frameworkName}`,
    "",
    "Source document content:",
    truncated,
    "",
    "Extract all controls as a JSON array matching this schema:",
    SCHEMA_HINT,
  ].join("\n");
}

export { SYSTEM_PROMPT as EXTRACT_SYSTEM };

export function parseExtraction(raw: string): RawControl[] {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket < 0 || lastBracket < 0) {
    throw new Error("no JSON array found in LLM response");
  }
  const json = trimmed.slice(firstBracket, lastBracket + 1);
  const parsed = JSON.parse(json);
  return extractionSchema.parse(parsed);
}
