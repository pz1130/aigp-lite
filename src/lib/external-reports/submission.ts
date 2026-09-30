import { z } from "zod";
import { verifyRenderedAt } from "./anti-abuse";

export const HONEYPOT_FIELD = "website";
export const MIN_FILL_MS = 3000;

export const submissionSchema = z.object({
  type: z.enum(["vulnerability", "usage_violation"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(8000),
  reproSteps: z.string().max(8000).optional().default(""),
  reporterEmail: z.string().email().optional(),
});

export type SubmissionData = z.infer<typeof submissionSchema>;

export type SubmissionOutcome =
  | { kind: "silent" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; data: SubmissionData };

/**
 * Pure gate for steps 3–5 of the abuse pipeline (honeypot, min-fill-time, Zod).
 * Payload-cap, IP rate-limit, and token-resolve are handled by the HTTP route.
 */
export function evaluateSubmission(
  body: unknown,
  now: number,
): SubmissionOutcome {
  const b = (body ?? {}) as Record<string, unknown>;

  const honeypot = b[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return { kind: "silent" };
  }

  const ts =
    typeof b.renderedAt === "string" ? verifyRenderedAt(b.renderedAt) : null;
  if (ts === null || now - ts < MIN_FILL_MS) {
    return { kind: "silent" };
  }

  const parsed = submissionSchema.safeParse(b);
  if (!parsed.success) {
    return { kind: "invalid", message: "invalid submission" };
  }
  return { kind: "ok", data: parsed.data };
}
