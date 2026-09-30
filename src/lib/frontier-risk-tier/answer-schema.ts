import { z } from "zod";

export const frtStatus = z.enum(["unanswered", "met", "not_met", "na"]);
export type FrtStatusInput = z.infer<typeof frtStatus>;

export const saveAnswerInput = z.object({
  assessmentId: z.string().min(1),
  thresholdCode: z
    .string()
    .regex(
      /^FRT-[A-Z_]+-T[1-3]-\d+$/,
      "thresholdCode must look like FRT-CYBER-T2-1",
    ),
  status: frtStatus,
  elaboration: z.string().max(5000).optional(),
  evidenceRefs: z.array(z.string()).default([]),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerInput>;

export const createInput = z.object({
  usecaseId: z.string().min(1).nullish(),
  title: z.string().min(1).max(200),
});
export type CreateInput = z.infer<typeof createInput>;
