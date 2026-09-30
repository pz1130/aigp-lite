import { z } from "zod";

const TIMELINE_SOURCES = ["audit", "policy", "llm", "incident"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

export const timelineEntrySchema = z.object({
  at: z.string().min(1).max(40),
  event: z.string().min(1).max(140),
  source: z.enum(TIMELINE_SOURCES),
});
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

export const recommendationSchema = z.object({
  title: z.string().min(1).max(80),
  detail: z.string().min(1).max(400),
  priority: z.enum(PRIORITIES),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const llmOutputSchema = z.object({
  summary: z.string().min(20).max(600),
  rootCause: z.string().min(20).max(1200),
  timeline: z.array(timelineEntrySchema).max(20),
  recommendations: z.array(recommendationSchema).max(5),
});
export type LlmOutput = z.infer<typeof llmOutputSchema>;

export const DIAGNOSTIC_CODES = [
  "timeline_at_invalid",
  "timeline_out_of_range",
  "audit_truncated",
  "context_truncated",
  "schema_parse_failed",
  "provider_error",
  "incident_not_found",
  "empty_output",
  "already_running",
] as const;
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export const diagnosticSchema = z.object({
  code: z.enum(DIAGNOSTIC_CODES),
  message: z.string().min(1).max(300),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;
