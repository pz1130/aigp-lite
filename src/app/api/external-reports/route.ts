import { NextRequest, NextResponse } from "next/server";
import { externalReportRateLimiter } from "@/lib/rate-limit/tokenBucket";
import { hashIp } from "@/lib/external-reports/anti-abuse";
import { evaluateSubmission } from "@/lib/external-reports/submission";
import {
  resolveUsecaseByToken,
  createExternalReport,
  type ResolvedUsecase,
} from "@/lib/external-reports/service";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

export interface SubmissionDeps {
  resolve: (token: string) => Promise<ResolvedUsecase | null>;
  create: (input: {
    usecase: ResolvedUsecase;
    data: {
      type: string;
      title: string;
      description: string;
      reproSteps: string;
      reporterEmail?: string;
    };
    ip: string | null | undefined;
    userAgent: string | null | undefined;
  }) => Promise<{ id: string }>;
  now: () => number;
  ip?: string | null;
  userAgent?: string | null;
}

interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

/** Gate steps 3–7 (honeypot/min-fill/Zod/token/persist). Payload cap + IP limit run in POST. */
export async function handleSubmission(
  parsed: unknown,
  deps: SubmissionDeps,
): Promise<HandlerResult> {
  const outcome = evaluateSubmission(parsed, deps.now());
  if (outcome.kind === "silent") return { status: 200, body: { ok: true } };
  if (outcome.kind === "invalid")
    return { status: 400, body: { error: "invalid submission" } };

  const token = (parsed as Record<string, unknown>).token;
  const usecase = typeof token === "string" ? await deps.resolve(token) : null;
  if (!usecase) return { status: 404, body: { error: "not found" } };

  await deps.create({
    usecase,
    data: outcome.data,
    ip: deps.ip,
    userAgent: deps.userAgent,
  });
  return { status: 200, body: { ok: true } };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const ip = req.headers.get("x-forwarded-for");
  const limit = await externalReportRateLimiter.consumeByKeyAsync(hashIp(ip));
  if (!limit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((limit.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await handleSubmission(parsed, {
    resolve: resolveUsecaseByToken,
    create: createExternalReport,
    now: () => Date.now(),
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
