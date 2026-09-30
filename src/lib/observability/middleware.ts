import { auth } from "@/lib/auth/auth";
import { setContext } from "./logger";
import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";

export async function withObservability(request: NextRequest): Promise<{
  requestId: string;
  orgId: string | undefined;
  userId: string | undefined;
}> {
  // Generate or reuse requestId
  const requestId =
    request.headers.get("x-request-id") ??
    (crypto.randomUUID ? crypto.randomUUID() : nanoid());

  // orgId — trusted via middleware auth (set by upstream auth layer)
  const orgId = request.headers.get("x-org-id") ?? undefined;

  // userId — extracted from session if authenticated
  let userId: string | undefined;
  try {
    const session = await auth();
    userId = (session?.user as { id?: string } | undefined)?.id;
  } catch {
    // auth() may throw in some Edge runtime paths; treat as unauthenticated
    userId = undefined;
  }

  // Attach to structured log context so all subsequent logs are enriched
  setContext({ orgId, userId, requestId });

  return { requestId, orgId, userId };
}

/**
 * Creates a Next.js middleware handler that instruments every request with
 * observability context (orgId, userId, requestId) and injects X-Request-Id.
 *
 * Usage in src/middleware.ts:
 *   import { observabilityMiddleware } from "@/lib/observability/middleware";
 *   export default observabilityMiddleware;
 */
export function createObservabilityMiddleware(
  next: (req: NextRequest) => Response | Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const { requestId } = await withObservability(req);

    const response = await next(req);

    // Inject X-Request-Id so clients can correlate logs
    if (response.headers.get("x-request-id") !== requestId) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set("X-Request-Id", requestId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  };
}
