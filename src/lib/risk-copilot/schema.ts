import { z } from "zod";

export const severityEnum = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof severityEnum>;

export const suggestionItemSchema = z.object({
  riskCode: z.string().min(1).max(60),
  severity: severityEnum,
  rationale: z.string().min(20).max(600),
  evidenceQuote: z.string().min(1).max(120),
  mitigationIds: z.array(z.string().min(1).max(80)).max(5).default([]),
});
export type SuggestionItem = z.infer<typeof suggestionItemSchema>;

export const llmOutputSchema = z.object({
  flag: z.enum(["ok", "insufficient_info"]).default("ok"),
  reason: z.string().max(300).optional(),
  suggestions: z.array(suggestionItemSchema).max(10),
});
export type LlmOutput = z.infer<typeof llmOutputSchema>;

export const DIAGNOSTIC_CODES = [
  "unknown_risk_code",
  "hallucinated_quote",
  "invalid_mitigation",
  "duplicate_risk",
  "catalog_truncated",
  "schema_parse_failed",
  "provider_error",
  "description_too_short",
  "catalog_empty",
  "already_running",
] as const;
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export const diagnosticSchema = z.object({
  code: z.enum(DIAGNOSTIC_CODES),
  message: z.string().min(1).max(300),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;
