import { z } from "zod";

export const classificationSchema = z.object({
  domain: z.string().nullable(),
  containsPii: z.boolean(),
  dataSensitivity: z.enum(["low", "medium", "high"]).nullable(),
  automatedDecisionMaking: z.boolean(),
  euAiActCategory: z
    .enum(["prohibited", "high", "limited", "minimal", "unknown"])
    .nullable(),
  complianceTags: z.array(z.string()).max(10),
  suggestedRisks: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        severity: z.enum(["low", "medium", "high"]),
        rationale: z.string().max(500),
      }),
    )
    .max(8),
  summary: z.string().max(800),
  confidence: z.number().min(0).max(1),
  riskScoreInt: z.number().int().min(0).max(100),
});

export type ClassificationOutput = z.infer<typeof classificationSchema>;

const SYSTEM_PROMPT = `You are an AI governance analyst. Given the metadata of an AI use case (name, autonomy level, deployment type, description, model card), classify it across compliance and risk dimensions. Be conservative: when in doubt about PII, automated decision-making, or EU AI Act category, mark "unknown" or false. Respond with a single JSON object, no preface, no markdown fences.`;

const SCHEMA_HINT = `{
  "domain": string | null,            // e.g. healthcare, finance, hr, marketing, education, public_sector, other
  "containsPii": boolean,
  "dataSensitivity": "low" | "medium" | "high" | null,
  "automatedDecisionMaking": boolean,  // true if the system makes consequential decisions about people without human review
  "euAiActCategory": "prohibited" | "high" | "limited" | "minimal" | "unknown" | null,
  "complianceTags": string[],          // applicable regs/standards: GDPR, PIPL, HIPAA, SOC2, ISO27001, ...
  "suggestedRisks": [
    { "title": string, "severity": "low" | "medium" | "high", "rationale": string }
  ],
  "summary": string,                   // <= 800 chars, executive summary of what this use case does and its key risks
  "confidence": number,                // 0..1
  "riskScoreInt": number               // 0..100, your overall risk estimate independent of recorded controls
}`;

export interface UsecaseInput {
  name: string;
  autonomyLevel: string;
  deploymentType: string;
  description: string;
  modelCardMd: string;
}

export function buildUserPrompt(u: UsecaseInput): string {
  return [
    `Use case: ${u.name}`,
    `Autonomy level: ${u.autonomyLevel}`,
    `Deployment type: ${u.deploymentType}`,
    "",
    "Description:",
    u.description || "(not documented)",
    "",
    "Model card:",
    u.modelCardMd || "(not documented)",
    "",
    "Return JSON matching this schema:",
    SCHEMA_HINT,
  ].join("\n");
}

export const SYSTEM = SYSTEM_PROMPT;

export function parseClassification(raw: string): ClassificationOutput {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0) {
    throw new Error("no JSON object found in LLM response");
  }
  const json = trimmed.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(json);
  return classificationSchema.parse(parsed);
}
