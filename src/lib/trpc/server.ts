import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { count } from "@/lib/observability/metrics";
import type { SessionContext } from "@/lib/auth/types";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { AppError, type ErrorCode } from "@/lib/errors";

// Register event subscribers (imported for side-effects; handlers register on the singleton bus)
import "@/lib/inventory/subscribers";
import "@/lib/integrations/subscribers";
import "@/lib/workflow/subscribers";
import "@/lib/risk/subscribers";
import "@/lib/incident/subscribers";
import "@/lib/integrations-ext/subscriber";
import "@/lib/notification/subscribers";

export interface TRPCContext {
  session: SessionContext | null;
  ip?: string;
  userAgent?: string;
}

// Lazy-load getSessionContext so test files importing the router don't pull NextAuth.
export async function createContext(req: Request): Promise<TRPCContext> {
  const { getSessionContext } = await import("@/lib/auth/session");
  const session = await getSessionContext();
  return {
    session,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

const TRPC_CODE_BY_APP_ERROR_CODE: Record<ErrorCode, TRPCErrorCode> = {
  UNAUTHENTICATED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

// Procedures throw domain errors (`AppError` subclasses, e.g. `ForbiddenError`
// from `assertPermission`) rather than `TRPCError` directly. Left unmapped,
// tRPC's default unknown-error handling wraps any non-TRPCError as
// INTERNAL_SERVER_ERROR, so an RBAC rejection would surface to callers as a
// 500 instead of FORBIDDEN even though the message is preserved. This
// middleware re-derives the intended code from the wrapped `AppError` before
// the response is built.
const withAppErrorMapping = publicProcedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    const cause = result.error.cause;
    throw new TRPCError({
      code: TRPC_CODE_BY_APP_ERROR_CODE[cause.code],
      message: cause.message,
      cause,
    });
  }
  return result;
});

// Sentry observability middleware on the base procedure so it covers all
// downstream procedures (protectedProcedure, orgProcedure, and any future
// procedures built on top). Duration is captured by the span automatically;
// error paths emit a count metric.
const baseProcedure = withAppErrorMapping.use(async ({ ctx, next, path }) => {
  const attributes: Record<string, string> = {};
  if ("session" in ctx && ctx.session?.orgId) {
    attributes.org = ctx.session.orgId;
  }
  return Sentry.startSpan({ name: path, op: "trpc", attributes }, async () => {
    const result = await next({ ctx });
    if (!result.ok) {
      count("trpc.error", { path });
    }
    return result;
  });
});

export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// orgProcedure: protected + auto-scoped Prisma client (`ctx.db`).
export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  const db = withOrg(prisma, ctx.session.orgId);
  return next({ ctx: { ...ctx, db } });
});
