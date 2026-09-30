import * as Sentry from "@sentry/nextjs";

/**
 * Wraps a Sentry.metrics call with the "never break the request path" pattern.
 * All errors are swallowed silently so observability tooling can never affect
 * the caller's control flow.
 */
function emit(
  name: string,
  value: number,
  type: "count" | "gauge" | "distribution",
  tags?: Record<string, string | number>,
): void {
  try {
    const attributes = Object.fromEntries(
      Object.entries(tags ?? {}).map(([k, v]) => [k, String(v)]),
    );
    if (type === "count") {
      Sentry.metrics.count(name, value, { attributes });
    } else if (type === "gauge") {
      Sentry.metrics.gauge(name, value, { attributes });
    } else {
      Sentry.metrics.distribution(name, value, { attributes });
    }
  } catch {
    // observability must never break the request path
  }
}

/**
 * Increment a counter metric by 1.
 */
export function count(
  name: string,
  tags?: Record<string, string | number>,
): void {
  emit(name, 1, "count", tags);
}

/**
 * Set an absolute value for a gauge metric.
 */
export function gauge(
  name: string,
  value: number,
  tags?: Record<string, string | number>,
): void {
  emit(name, value, "gauge", tags);
}

/**
 * Record a value in a distribution (histogram) metric.
 */
export function distribution(
  name: string,
  value: number,
  tags?: Record<string, string | number>,
): void {
  emit(name, value, "distribution", tags);
}

/**
 * Time an async function and emit the elapsed duration as a distribution metric.
 * Returns whatever the wrapped function returns, so it is transparent to callers.
 */
export async function timing<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string | number>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    // Silently swallow — timing errors must not alter the caller's result.
    try {
      const attributes = Object.fromEntries(
        Object.entries(tags ?? {}).map(([k, v]) => [k, String(v)]),
      );
      Sentry.metrics.distribution(name, duration, { attributes });
    } catch {
      // observability must never break the request path
    }
  }
}

/**
 * Backward-compat alias for `count`. Prefer `count` in new code.
 * @deprecated use `count` instead
 */
export const metric = count;
