import { defineConfig } from "@playwright/test";
import "dotenv/config";

const CI = !!process.env.CI;
const E2E_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const E2E_ENCRYPTION_KEY = process.env.AIGP_ENCRYPTION_KEY;

if (!E2E_DATABASE_URL) {
  throw new Error(
    "E2E_DATABASE_URL is not configured; set TEST_DATABASE_URL or DATABASE_URL before running Playwright.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Locally the suite drives `next dev`, so a first hit on a route pays a
  // webpack compile; CI serves a prebuilt bundle and never does. The CI budget
  // is still the larger of the two because a 2-core runner executes everything
  // else more slowly than a dev laptop.
  timeout: CI ? 60_000 : 30_000,
  fullyParallel: false,
  // Cap workers to avoid corrupting Next.js dev .next/cache via parallel writes.
  // With 9 workers we observed concurrent webpack pack renames failing and
  // the dev server returning 404 mid-suite. 3 keeps runs stable.
  workers: 3,
  // One retry in CI absorbs runner scheduling jitter only. A spec that fails
  // twice is a real failure — do not raise this to paper over a flake.
  retries: CI ? 1 : 0,
  // A 2-core runner is slower than a dev laptop at everything: hydration, route
  // handlers, Postgres round-trips. A genuinely missing element still fails,
  // just 10s later.
  expect: { timeout: CI ? 15_000 : 5_000 },
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3001",
    headless: true,
    trace: CI ? "retain-on-failure" : "off",
    screenshot: CI ? "only-on-failure" : "off",
  },
  webServer: [
    {
      // CI serves a prebuilt bundle (the workflow runs `npm run build` first).
      // `next dev` compiles every route on its first request, and on a 2-core
      // runner those compiles blow past the per-call timeouts that ~10 specs
      // hardcode (`waitForURL(..., { timeout: 10_000 })`) — timeouts no config
      // knob can raise. A production server has no compile step at all.
      // Locally `next dev` stays, so an edit is live without a rebuild.
      // The CI path serves the same standalone artifact as the Docker image.
      // The two static directories are copied because Next intentionally leaves
      // them outside `.next/standalone` for container layers to provide.
      command: CI
        ? "sh -c 'mkdir -p .next/standalone/public .next/standalone/.next/static && cp -R public/. .next/standalone/public/ && cp -R .next/static/. .next/standalone/.next/static/ && PORT=3001 node .next/standalone/server.js'"
        : "npm run dev",
      url: "http://localhost:3001",
      timeout: 60_000,
      reuseExistingServer: !CI,
      env: {
        // Prefer the dedicated test database when it is present. Without this
        // override, local Playwright runs silently mutate the developer DB and
        // can fail later when its migrations lag behind the test schema.
        DATABASE_URL: E2E_DATABASE_URL,
        // Provider credentials in the seed are encrypted before Playwright
        // starts the server. Pass the same key through explicitly so a local
        // shell override cannot leave background analysis unable to decrypt.
        ...(E2E_ENCRYPTION_KEY
          ? { AIGP_ENCRYPTION_KEY: E2E_ENCRYPTION_KEY }
          : {}),
        // .env pins NEXTAUTH_URL to :3000 (production `next start`); the e2e
        // dev server runs on :3001, so auth redirects must resolve there or
        // register/logout flows bounce to a dead port (ERR_CONNECTION_REFUSED).
        NEXTAUTH_URL: "http://localhost:3001",
        HOSTNAME: "127.0.0.1",
        // Force the inline job fallback: with REDIS_URL set, background jobs
        // (incident dedup suggestions, drift runs, …) land on the BullMQ queue
        // and silently wait for a worker process Playwright never starts.
        // NOTE: with `reuseExistingServer` a manually started dev server keeps
        // its own env — restart it without Redis if dedup specs fail locally.
        REDIS_URL: "",
        // The SSRF egress guard blocks private destinations; redteam/playground
        // specs point provider connections at the local mock (localhost:4010).
        AIGP_EGRESS_ALLOWLIST: "127.0.0.1/32,localhost",
        // .env may configure the Moonshot sidecar (docker-network hostname,
        // unreachable from a host-run dev server); redteam e2e uses the
        // builtin engine, so disable Moonshot for the test server.
        AIGP_MOONSHOT_URL: "",
        // `next start` hard-sets NODE_ENV=production, which closes the
        // isTestMode() gate and 404s /api/test/outbox — the only way to recover
        // a raw invite token (OrgInvite stores just a tokenHash), so
        // members-invite would be untestable. Re-open it explicitly, for this
        // server only. Never set this on a real deployment; see
        // src/lib/notification/test-outbox.ts.
        ...(CI
          ? {
              AIGP_ENABLE_TEST_OUTBOX: "1",
              NODE_ENV: "production",
            }
          : {}),
      },
    },
    {
      // Tiny SSE-capable mock; Prism could only return the fixed YAML example
      // and did not stream, which prevented end-to-end SSE assertions.
      command: "npx tsx tests/fixtures/mock-providers/openai-sse-server.ts",
      url: "http://localhost:4010/health",
      timeout: 30_000,
      reuseExistingServer: !CI,
    },
  ],
});
