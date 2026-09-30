import { z } from "zod";

export const checkStatus = z.enum(["unanswered", "yes", "no", "na"]);
export type CheckStatusInput = z.infer<typeof checkStatus>;

export const saveAnswerInput = z.object({
  assessmentId: z.string().min(1),
  itemCode: z.string().regex(/^AG\d-\d{2}$/, "itemCode must look like AG1-01"),
  status: checkStatus,
  elaboration: z.string().max(5000).optional(),
  evidenceRefs: z.array(z.string()).default([]),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerInput>;

export const createInput = z.object({
  usecaseId: z.string().min(1).nullish(),
  title: z.string().min(1).max(200),
});
export type CreateInput = z.infer<typeof createInput>;
