export interface RetryOpts {
  maxAttempts: number;
  backoffMs: number[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt >= opts.maxAttempts) throw e;
      const delay =
        opts.backoffMs[attempt - 1] ??
        opts.backoffMs[opts.backoffMs.length - 1] ??
        0;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
