import type {
  LlmOutput,
  Diagnostic,
  TimelineEntry,
  Recommendation,
} from "./schema";

export type ValidateInput = {
  raw: LlmOutput;
  openedAt: Date;
  now: Date;
  preDiagnostics?: Diagnostic[];
};

export type ValidateResult = {
  status: "ok" | "needs_review" | "failed";
  summary: string;
  rootCause: string;
  timeline: TimelineEntry[];
  recommendations: Recommendation[];
  diagnostics: Diagnostic[];
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function validateOutput(input: ValidateInput): ValidateResult {
  const diagnostics: Diagnostic[] = [...(input.preDiagnostics ?? [])];

  if (!input.raw.summary || !input.raw.summary.trim()) {
    diagnostics.push({
      code: "empty_output",
      message: "LLM returned empty summary",
    });
    return {
      status: "failed",
      summary: "",
      rootCause: "",
      timeline: [],
      recommendations: [],
      diagnostics,
    };
  }

  const lowerBound = input.openedAt.getTime() - SEVEN_DAYS_MS;
  const upperBound = input.now.getTime() + ONE_HOUR_MS;

  const cleanedTimeline: TimelineEntry[] = [];
  for (const entry of input.raw.timeline) {
    const parsed = Date.parse(entry.at);
    if (Number.isNaN(parsed)) {
      diagnostics.push({
        code: "timeline_at_invalid",
        message: `bad at: ${entry.at}`,
      });
      continue;
    }
    if (parsed < lowerBound || parsed > upperBound) {
      diagnostics.push({
        code: "timeline_out_of_range",
        message: `out of range: ${entry.at}`,
      });
      continue;
    }
    cleanedTimeline.push(entry);
  }

  const status: ValidateResult["status"] =
    diagnostics.length > 0 ? "needs_review" : "ok";

  return {
    status,
    summary: input.raw.summary,
    rootCause: input.raw.rootCause,
    timeline: cleanedTimeline,
    recommendations: input.raw.recommendations,
    diagnostics,
  };
}
