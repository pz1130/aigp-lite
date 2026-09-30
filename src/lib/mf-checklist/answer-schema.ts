import { z } from "zod";

export const checkStatus = z.enum(["unanswered", "yes", "no", "na"]);
export type CheckStatusInput = z.infer<typeof checkStatus>;

export const saveAnswerInput = z.object({
  assessmentId: z.string().min(1),
  itemCode: z.string().regex(/^C\d+-P\d+$/, "itemCode must look like C1-P1"),
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
