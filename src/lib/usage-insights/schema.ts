import { z } from "zod";

export const clusterOutputSchema = z.object({
  label: z.string().min(2).max(80),
  narrative: z.string().min(20).max(1500),
  systemicObservation: z.string().min(10).max(800),
  confidence: z.enum(["low", "medium", "high"]),
});
export type ClusterOutput = z.infer<typeof clusterOutputSchema>;

export const execSummarySchema = z.object({
  execSummary: z.string().min(20).max(1200),
});
export type ExecSummaryOutput = z.infer<typeof execSummarySchema>;

export const USAGE_DIAGNOSTIC_CODES = [
  "llm_unavailable",
  "embedding_fallback",
  "insufficient_data",
  "corpus_capped",
  "unembeddable_invocations",
  "cluster_llm_failed",
  "exec_summary_failed",
  "already_running",
  "no_consented_data",
] as const;
export type UsageDiagnosticCode = (typeof USAGE_DIAGNOSTIC_CODES)[number];

export interface UsageDiagnostic {
  code: UsageDiagnosticCode;
  message: string;
}
