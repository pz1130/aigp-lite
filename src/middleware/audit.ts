import type { NextRequest } from "next/server";
import { warn } from "@/lib/observability/logger";
import { withObservability } from "@/lib/observability/middleware";

/**
 * Audit action constants. These are written to the audit log for
 * auto-captured events that aren't explicitly logged by route handlers.
 */
export const AuditAction = {
  SERVER_ERROR: "server.error",
  PERMISSION_DENIED: "permission.denied",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

interface AuditContext {
  orgId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Wraps a Next.js App Router handler with transparent audit capture.
 *
 * - 5xx responses → audit with action `server.error`
 * - TRPCError with code FORBIDDEN → audit with action `permission.denied`
 *
 * The wrapper does NOT re-throw caught errors — it lets the original
 * response propagate while logging asynchronously in the background.
 */
export function withAudit(
  handler: (req: NextRequest, ctx?: AuditContext) => Promise<Response>,
  getContext?: (req: NextRequest) => AuditContext | Promise<AuditContext>,
) {
  return async (req: NextRequest): Promise<Response> => {
    // Instrument observability context (orgId, userId, requestId) for all logs
    const { orgId: obsOrgId, userId: obsUserId } = await withObservability(req);
    const ctx: AuditContext = getContext ? await getContext(req) : {};

    // Merge observability-derived ids into audit context
    if (!ctx.orgId && obsOrgId) ctx.orgId = obsOrgId;
    if (!ctx.userId && obsUserId) ctx.userId = obsUserId;

    try {
      const res = await handler(req, ctx);

      // Auto-capture 5xx errors — capture after response is available
      if (res.status >= 500) {
        const body = await res
          .clone()
          .text()
          .catch(() => "");
        void writeAuditAsync({
          orgId: ctx.orgId ?? "unknown",
          action: AuditAction.SERVER_ERROR,
          resourceType: "http",
          resourceId: req.url,
          after: {
            status: res.status,
            method: req.method,
            url: req.url,
            bodyExcerpt: body.slice(0, 500),
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }

      return res;
    } catch (err: unknown) {
      // Permission denied — TRPCError with FORBIDDEN code
      if (isTRPCError(err) && err.code === "FORBIDDEN") {
        void writeAuditAsync({
          orgId: ctx.orgId ?? "unknown",
          action: AuditAction.PERMISSION_DENIED,
          resourceType: "permission",
          resourceId: req.url,
          after: {
            method: req.method,
            url: req.url,
            error: err.message,
            // Attempt to extract resource/action from the error details
            details: err.data ?? undefined,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }

      // Re-throw so the original error handler / error boundary can respond
      throw err;
    }
  };
}

function isTRPCError(
  err: unknown,
): err is { code: string; message: string; data?: unknown } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}

// Fire-and-forget audit write — errors are swallowed so audit capture
// cannot affect the main request flow, but are surfaced via structured log.
async function writeAuditAsync(
  input: Parameters<typeof import("@/lib/audit/log").writeAudit>[0],
): Promise<void> {
  try {
    const { writeAudit } = await import("@/lib/audit/log");
    await writeAudit(input);
  } catch (err) {
    // Swallow audit failure so it never breaks the request, but log it.
    warn("[audit] failed to write audit log", { error: String(err), input });
  }
}
