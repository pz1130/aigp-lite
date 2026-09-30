import pino from "pino";

export interface LogContext {
  orgId?: string;
  userId?: string;
  requestId?: string;
}

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    orgId: undefined,
    userId: undefined,
    requestId: undefined,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function setContext(ctx: LogContext): void {
  logger.bindings();
  // Attach context as base fields so every subsequent log entry includes them
  if (ctx.orgId !== undefined) logger.setBindings({ orgId: ctx.orgId });
  if (ctx.userId !== undefined) logger.setBindings({ userId: ctx.userId });
  if (ctx.requestId !== undefined)
    logger.setBindings({ requestId: ctx.requestId });
}

export function clearContext(): void {
  logger.setBindings({
    orgId: undefined,
    userId: undefined,
    requestId: undefined,
  });
}

export { logger };

// Convenience helpers that always include context
export const info = (msg: string, extra?: Record<string, unknown>) =>
  logger.info({ ...extra }, msg);

export const error = (msg: string, extra?: Record<string, unknown>) =>
  logger.error({ ...extra }, msg);

export const warn = (msg: string, extra?: Record<string, unknown>) =>
  logger.warn({ ...extra }, msg);

export const debug = (msg: string, extra?: Record<string, unknown>) =>
  logger.debug({ ...extra }, msg);
