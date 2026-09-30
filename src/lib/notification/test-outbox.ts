export type TestEmail = {
  to: string;
  subject: string;
  body: string;
  at: number;
};

/**
 * True in dev and test, false in a production build. Gates the test-only email
 * outbox and the /api/test/outbox endpoint so neither exists in production.
 *
 * Keyed off NODE_ENV so Playwright's `reuseExistingServer` works without
 * threading an extra env var into the dev server. Unknown or unset environments
 * stay closed; only explicit development/test modes enable the outbox.
 *
 * AIGP_ENABLE_TEST_OUTBOX="1" re-opens the gate inside a production build. It
 * exists for one caller: the CI e2e job, which runs the standalone server (see
 * `playwright.config.ts`) because `next dev` compiles each route on first hit
 * and a 2-core runner cannot finish the suite inside the specs' own timeouts.
 *
 * DO NOT set it on a real deployment. The outbox holds raw invite tokens, and
 * /api/test/outbox hands them to any unauthenticated caller who knows an
 * invited address — with this flag on in production, that is account takeover.
 * It is deliberately opt-in and deliberately named: nothing sets it by default,
 * and no deploy manifest in this repo references it.
 */
export function isTestMode(): boolean {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return true;
  }
  return (
    process.env.NODE_ENV === "production" &&
    process.env.AIGP_ENABLE_TEST_OUTBOX === "1"
  );
}

// Stored on globalThis (the same pattern as the Prisma client in src/lib/db.ts)
// so the outbox is a true process-wide singleton. Next.js bundles each route
// separately, so a plain module-level `const` would give the invite route and
// the /api/test/outbox route *different* Maps — the captured email would never
// be visible to the endpoint that reads it.
const globalForOutbox = globalThis as unknown as {
  __testOutbox?: Map<string, TestEmail[]>;
};

const outbox: Map<string, TestEmail[]> =
  globalForOutbox.__testOutbox ?? (globalForOutbox.__testOutbox = new Map());

export function recordTestEmail(msg: {
  to: string;
  subject: string;
  body: string;
}): void {
  const key = msg.to.toLowerCase();
  const list = outbox.get(key) ?? [];
  list.push({
    to: msg.to,
    subject: msg.subject,
    body: msg.body,
    at: Date.now(),
  });
  outbox.set(key, list);
}

export function getLatestForEmail(email: string): TestEmail | undefined {
  const list = outbox.get(email.toLowerCase());
  if (!list || list.length === 0) return undefined;
  return list[list.length - 1];
}

export function clearTestOutbox(): void {
  outbox.clear();
}
