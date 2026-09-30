/**
 * Deterministic PII redaction applied to MCP invocation summaries BEFORE
 * embedding. Aggregate-only privacy posture: no raw text ever leaves the
 * clustering stage, but scrubbing here defends against PII leaking into
 * embeddings, LLM prompts, or diagnostics. Regex-based and side-effect free.
 */
export function scrubText(input: string): string {
  if (!input) return input;
  let s = input;
  s = s.replace(/\bhttps?:\/\/[^\s]+/gi, "[url]");
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, "[email]");
  s = s.replace(/\b(?:\d[ -]?){13,16}\b/g, "[card]");
  s = s.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]");
  s = s.replace(/\+?\d[\d\s().-]{6,}\d/g, (m) =>
    /\d[\s().-]/.test(m) ? "[phone]" : m,
  );
  s = s.replace(/\b\d{7,}\b/g, "[num]");
  return s;
}
