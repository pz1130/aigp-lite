import { z } from "zod";

export const ruleJsonSchema = z.unknown();

export const testCaseSchema = z.object({
  text: z.string().min(1).max(2000),
  shouldHit: z.boolean(),
  reason: z.string().min(1).max(200),
});

export const llmOutputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  ruleJson: ruleJsonSchema,
  severity: z.enum(["low", "medium", "high"]),
  enforcementMode: z.enum(["block", "warn", "log"]),
  scope: z.enum(["input", "output", "both"]),
  tests: z.array(testCaseSchema).length(3),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;

export const generationResultSchema = llmOutputSchema.extend({
  status: z.enum(["ok", "needs_review", "failed"]),
  diagnostics: z
    .array(
      z.object({
        kind: z.enum(["schema_parse", "evaluate_throw", "self_check_miss"]),
        message: z.string(),
        testIndex: z.number().optional(),
      }),
    )
    .optional(),
});

export type GenerationResult = z.infer<typeof generationResultSchema>;
