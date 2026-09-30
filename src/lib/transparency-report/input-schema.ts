import { z } from "zod";
import { SECTION_KEYS } from "./sections";

export const createReportInput = z.object({
  usecaseId: z.string().min(1).nullish(),
  title: z.string().min(1).max(200),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  periodLabel: z.string().min(1).max(80),
});
export type CreateReportInput = z.infer<typeof createReportInput>;

export const saveSectionInput = z.object({
  id: z.string().min(1),
  key: z.string().refine((k) => SECTION_KEYS.has(k), "unknown section key"),
  text: z.string().max(20000),
});
export type SaveSectionInput = z.infer<typeof saveSectionInput>;
