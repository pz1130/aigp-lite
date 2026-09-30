// Structure adapted from Microsoft Agent Governance Toolkit (MIT)
// compliance/fria-template.md (9 sections + 8 EU Charter rights).
import { z } from "zod";

const RIGHT_KEYS = [
  "humanDignity",
  "nonDiscrimination",
  "privacy",
  "effectiveRemedy",
  "freeExpression",
  "education",
  "workersRights",
  "childrenRights",
] as const;

const rightAssessment = z.object({
  applicability: z.enum(["applicable", "not_applicable", "unclear"]).optional(),
  potentialImpact: z.string().max(2000).optional(),
  affectedGroups: z.string().max(1000).optional(),
  mitigations: z.string().max(2000).optional(),
  residualRisk: z.enum(["low", "medium", "high"]).optional(),
});

export const friaSectionsSchema = z.object({
  system: z.object({
    name: z.string().min(1).max(200),
    annexIIICategory: z
      .enum([
        "biometrics",
        "critical_infrastructure",
        "education",
        "employment",
        "essential_services",
        "law_enforcement",
        "migration",
        "justice",
        "not_high_risk",
      ])
      .optional(),
    assessmentDate: z.string().optional(),
    assessors: z.string().max(500).optional(),
    dpoConsulted: z.boolean().optional(),
  }),
  purpose: z
    .object({
      description: z.string().max(3000).optional(),
      intendedContext: z.string().max(2000).optional(),
      affectedGroups: z
        .array(
          z.object({
            group: z.string().max(200),
            howAffected: z.string().max(500),
            estimatedScale: z.string().max(200),
          }),
        )
        .max(20)
        .optional(),
    })
    .optional(),
  rights: z.record(z.enum(RIGHT_KEYS), rightAssessment).optional(),
  governanceControls: z.string().max(5000).optional(),
  overallRisk: z
    .object({
      rating: z.enum(["low", "medium", "high", "critical"]).optional(),
      rationale: z.string().max(3000).optional(),
    })
    .optional(),
  mitigationPlan: z
    .array(
      z.object({
        action: z.string().max(500),
        owner: z.string().max(200).optional(),
        dueDate: z.string().optional(),
        status: z.enum(["planned", "in_progress", "done"]).optional(),
      }),
    )
    .max(50)
    .optional(),
  consultations: z
    .array(
      z.object({
        stakeholder: z.string().max(200),
        date: z.string().optional(),
        summary: z.string().max(1000).optional(),
      }),
    )
    .max(50)
    .optional(),
  signOff: z
    .object({
      statement: z.string().max(2000).optional(),
    })
    .optional(),
  reviewSchedule: z
    .object({
      nextReviewDate: z.string().optional(),
      triggers: z.string().max(2000).optional(),
    })
    .optional(),
});

export type FriaSections = z.infer<typeof friaSectionsSchema>;
export const FRIA_RIGHT_KEYS = RIGHT_KEYS;
