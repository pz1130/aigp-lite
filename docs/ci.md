# CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs seven jobs on every
push to `main`/`feat/**` and every PR into `main`:

| Job               | Services         | `REDIS_URL` | What it proves                                                             |
| ----------------- | ---------------- | ----------- | -------------------------------------------------------------------------- |
| `test`            | Postgres + Redis | set         | The real BullMQ queue path (`getQueue().add` + `metric("jobs.enqueued")`). |
| `test-no-redis`   | Postgres only    | unset       | The inline fallback path (`getQueue()` → `null`, processor runs in band).  |
| `e2e`             | Postgres only    | `""`        | The Playwright suite against a real browser — see below.                   |
| `build`           | —                | —           | `next build` succeeds env-free (mirrors the Dockerfile `builder` stage).   |
| `docker`          | —                | —           | The Dockerfile builds and the runner image serves a request — see below.   |
| `lint`            | —                | —           | `prettier --check .` and `eslint src`.                                     |
| `dependency-scan` | —                | —           | `npm audit` — see below.                                                   |

## Node version

`.nvmrc` is the single source of truth. Every job resolves its runtime with
`actions/setup-node`'s `node-version-file: ".nvmrc"`, the `docker` job passes the
same value as `--build-arg NODE_VERSION`, and `engines` in `package.json` floors
it. Bumping Node is therefore one edit; a Dockerfile that drifts off the CI
version fails the `docker` job instead of surfacing in production.

Both test jobs run the **same** suite; the only difference is whether Redis is
present. That difference is what decides which branch of
[`src/lib/jobs/enqueue.ts`](../src/lib/jobs/enqueue.ts) `enqueueJob` takes:

- **`REDIS_URL` set** → job is handed to the queue and `enqueueJob` returns. A
  worker would pick it up later.
- **`REDIS_URL` unset** → the processor is invoked inline (`await import("./processors")`).

Running both legs stops a regression in either branch from sneaking through. The
guard test [`src/lib/jobs/enqueue.redis-path.test.ts`](../src/lib/jobs/enqueue.redis-path.test.ts)
additionally pins the branch-selection behaviour at the unit level (it drives the
real `getRedisUrl → getConnection → getQueue` chain with BullMQ/ioredis stubbed),
so the `metric("jobs.enqueued")` call — which previously had zero coverage and
broke when a metrics mock omitted `metric` — can never silently disappear again.

## Why two explicit jobs, not a matrix

GitHub Actions cannot conditionally attach a service container based on a matrix
value — `services:` is evaluated before matrix expansion. So the no-Redis leg is
a separate job that simply omits the `redis` service and the `REDIS_URL` env.

## Worker smoke test

[`src/worker/smoke.test.ts`](../src/worker/smoke.test.ts) is the one test that
proves the **worker** actually boots, connects, and drains a job end-to-end (not
just that enqueue takes the Redis branch). It boots the real `startWorker()`,
enqueues a `worker.ping` job, and polls until the worker's processor writes the
nonce marker and the heartbeat advances.

It is gated `describe.skipIf(!process.env.REDIS_URL)`, so it **runs only in the
`test` leg** (Redis present) and is skipped in `test-no-redis`. It's part of the
normal `vitest run`, so no separate CI step is needed; run it alone with
`npm run worker:smoke` (requires `REDIS_URL`).

## Worker liveness probe (`/healthz`)

The worker process serves a dependency-free `node:http` liveness endpoint
([`src/worker/health-server.ts`](../src/worker/health-server.ts)):

- `GET /healthz` → `200 {status:"ok"}` while the worker writes fresh heartbeats,
  `503 {status:"stale"}` once they age out (Redis dropped, loop wedged, dying).
- Port: `AIGP_WORKER_HEALTH_PORT` (default **9091**).
- The worker writes `aigp:worker:heartbeat` to Redis every 15s (and on every
  job completion/failure) with a 60s TTL; `/healthz` reports stale past ~90s.

Wire it as a k8s `livenessProbe` or docker `HEALTHCHECK` against
`:9091/healthz`. Liveness ≠ correctness — a worker can be "ok" while a specific
processor is broken; the smoke test is what proves the drain path works.

## Web readiness probe (`/api/ready`)

The web process exposes two intentionally different probes:

- `GET /api/health` is a lightweight liveness check and returns 200 while the
  Next.js process can respond.
- `GET /api/ready` checks Postgres and, when `REDIS_URL` is configured, Redis.
  It returns 200 only when all configured dependencies respond, otherwise 503.

Use `/api/health` for restart/liveness decisions and `/api/ready` for load
balancer or rollout traffic gating. The readiness response contains only
coarse `ok` / `error` states and is marked `no-store`.

## Worker-absent caveat (important for test authors)

**There is no BullMQ worker running inside the test process.** In the `test` job
(`REDIS_URL` set) `enqueueJob` enqueues and returns, and nothing ever processes
the job. So any test that enqueues work and then asserts on its _result_ must mock
`enqueueJob` to run the processor inline — otherwise the job is orphaned and the
assertion sees stale `pending` state.

The canonical example is
[`src/lib/drift/router.test.ts`](../src/lib/drift/router.test.ts): `drift.startRun`
enqueues `drift.run`, so the test mocks `@/lib/jobs/enqueue` to call `runBenchmark`
inline (the same effect as the no-Redis path). Copy that pattern for any new test
that exercises an enqueue-then-assert flow.

An orphaned job in CI is a real bug, not a flake — don't paper over it with a
`setTimeout`.

## Isolated test files

Both test jobs use Vitest's `forks` pool with `fileParallelism: false`. Each
test file gets process isolation while files still run sequentially against the
shared Postgres database, which is truncated between files. Keep this setting:
running files in parallel would cross-contaminate rows.

## End-to-end tests

`e2e` runs the Playwright suite in `tests/e2e/` (27 specs) against a real
Chromium and a real running app. Until 2026-08 this suite existed but ran only
on developer machines, so every browser-level regression reached `main`
unchallenged.

**In CI it runs against a production standalone build (`next build` +
`.next/standalone/server.js`), while
locally it still drives `next dev`.** The first CI attempt used `next dev` and
failed with eight timeouts: a dev server compiles each route on its first
request, and on a 2-core runner those compiles overrun the 10–15s per-call
timeouts that roughly ten specs hardcode (`waitForURL(…, { timeout: 10_000 })`).
Those are inside the spec files, so no config knob can raise them. Paying ~3
minutes for a build buys a server with no compile step at all. Locally `next dev`
stays, so an edit is live without a rebuild.

That switch costs one thing. The accept-invite spec reads `/api/test/outbox` to
recover the raw invite token — `OrgInvite` stores only a `tokenHash`, so the
outbox is the sole way to get it — and
[`isTestMode()`](../src/lib/notification/test-outbox.ts) returns `false` under
the `NODE_ENV=production` that the standalone server uses. So the config passes
**`AIGP_ENABLE_TEST_OUTBOX="1"`** to the CI server, which re-opens the gate
inside a production build.

> **Never set `AIGP_ENABLE_TEST_OUTBOX` on a real deployment.** The outbox holds
> raw invite tokens and `/api/test/outbox` hands them to any unauthenticated
> caller who knows an invited address; with the flag on in production that is
> account takeover. It is opt-in, accepts only the exact value `"1"`, nothing
> sets it by default, and no deploy manifest in this repo references it.

Everything about the servers lives in `playwright.config.ts`, not in the
workflow — the job only supplies a database, the build, and env:

- Two `webServer` entries: the standalone server in CI / `npm run dev`
  locally, and the SSE mock provider
  (`tests/fixtures/mock-providers/openai-sse-server.ts`) on **:4010**.
- The app server gets `REDIS_URL=""` so `enqueueJob` runs inline. There is no
  worker process in the e2e job, so a queued job would simply never run. This is
  also why the job has **no `redis` service** — the opposite choice from `test`.
- `AIGP_EGRESS_ALLOWLIST=127.0.0.1/32,localhost` so the SSRF egress guard permits
  provider connections aimed at the local mock, and `AIGP_MOONSHOT_URL=""` so
  red-team specs use the built-in engine.

The job seeds the demo org (`npm run prisma:seed`) because
`tests/e2e/global-setup.ts` mints NextAuth session JWTs for the five seeded demo
users and writes them straight into Playwright `storageState`; it throws if
those users are missing. `NEXTAUTH_SECRET` is therefore set job-wide — the setup
signs with it and the dev server must verify with the same value — and
`AIGP_ENCRYPTION_KEY` likewise, so credentials sealed by the seed can be opened
by the running app.

**CI-only tolerances** (`const CI = !!process.env.CI` in `playwright.config.ts`):
per-test timeout 60s, assertion timeout 15s, and `retries: 1`. These absorb the
fact that a 2-core runner is slower than a dev laptop at hydration, route
handlers, and Postgres round-trips — and nothing else. A spec that fails twice is
a real failure; do not raise the retry count to quiet a flake. Workers stay
capped at 3 to keep parallel writes from corrupting the local dev `.next/cache`.

**Visual baselines do not run in CI.** `tests/e2e/visual-baseline.spec.ts` skips
itself on any non-macOS platform. Playwright names snapshots per platform and
only the `*-darwin.png` set is committed, so on a Linux runner there is no
baseline to compare against: the first run would silently write one and pass, and
every run after that would diff Linux font rasterisation against a file nobody
reviewed. Regenerating on Linux would only move the breakage to the macOS
developers. Run `npx playwright test visual-baseline` on macOS before a UI
change, and add `--update-snapshots` to re-bless.

On failure the job uploads a `playwright-report` artifact containing the HTML
report, traces (`retain-on-failure`), and failure screenshots.

Locally the suite is `npm run e2e` and needs a seeded database plus a `.env`
carrying `NEXTAUTH_SECRET`. When using a dedicated `TEST_DATABASE_URL`, point
`DATABASE_URL` at it while running the seed, then run Playwright with the same
`TEST_DATABASE_URL` and `AIGP_ENCRYPTION_KEY`:

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm run prisma:seed
npm run e2e
```

The seed encrypts provider credentials and the app must decrypt them during
background analysis. Do not run the plain `npm run prisma:seed` command when
`.env` contains separate development and E2E database URLs. `reuseExistingServer` is on outside CI, so a dev
server you already have on :3001 is reused — restart it without `REDIS_URL` if
the dedup specs hang. No local flag is needed for the outbox: `next dev` leaves
`NODE_ENV` off `production`, so `isTestMode()` is already true.

## Production build

`build` runs `npm run build` (Next.js production build) with **no** Postgres
service and **no** env vars — the same way the Dockerfile `builder` stage does.
`next build` collects routes, compiles the webpack/RSC bundles, and prerenders
static pages without a database or crypto keys, so a build regression (an import
that only resolves at build time, a bad `next.config`, a route that fails to
compile after a dependency major-bump) is caught here rather than at
`docker compose build` / deploy time. This gap first bit right after the Next 16
upgrade, which the test and lint jobs never exercise.

## Docker image

`build` proves `next build` works on the runner host; it says nothing about the
image that actually ships. `docker` closes that gap:

1. Builds `--target runner` (which pulls in `base` → `builder`, so `npm ci`,
   `prisma generate` and `next build` all run inside the image).
2. Builds `--target migrate` and `--target worker`, the two stages
   `docker-compose.yml` names explicitly. They branch off the cached `base`.
3. Runs the runner container and polls `GET /api/health` for up to 60s.

Step 3 is the point of the job: it runs `.next/standalone/server.js`, the one
artifact `build` never produces. The `runner` stage hand-copies `.next/static`,
`public/`, `prisma/` and `messages/` on top of it, so it is exactly the kind of
thing that breaks silently when `output: "standalone"` changes shape.

`/api/health` is the probe because it touches no database and no Redis, and
`src/proxy.ts` excludes `/api` from the locale matcher — it answers with nothing
else provisioned. Any real page returns 500 (`DatabaseNotReachable`) in this
job, which says nothing about the image. The container gets `HOSTNAME=0.0.0.0`
because Next's standalone server binds whatever it finds there, and a loopback
bind would be unreachable from outside the container. Nothing is pushed to a
registry.

## Dependency vulnerability scanning

`dependency-scan` runs two `npm audit` passes:

1. **`npm audit --omit=dev --audit-level=high`** (blocking) — production
   dependencies only, fails the build on high/critical advisories. The current
   lockfile passes cleanly; compatible transitive security pins are maintained
   in `package.json` without downgrading Prisma or ExcelJS.
2. **`npm audit`** (report-only, `|| true`) — full tree including
   devDependencies, so advisories in the vitest/vite/esbuild dev-server chain
   stay visible without blocking every PR. Those currently have no
   non-breaking fix (`npm audit fix --force` would jump vitest to a new major)
   and are dev-only (never shipped to production), so they're tracked rather
   than gated.

[`.github/dependabot.yml`](../.github/dependabot.yml) opens weekly PRs for npm
and GitHub Actions updates (minor/patch npm bumps grouped into one PR to cut
noise) so advisories get fixed via routine bumps rather than discovered cold
during an incident.

### Software Bill of Materials (SBOM)

The `dependency-scan` job generates a [CycloneDX](https://cyclonedx.org/) SBOM
of the **production** dependency tree on every run and uploads it as the
`sbom-cyclonedx` artifact (`sbom.json`, CycloneDX JSON).

- **Download:** open the CI run in GitHub Actions → **Artifacts** → `sbom-cyclonedx`.
- **Regenerate locally:** `npm run sbom:generate` (writes `sbom.json`; gitignored).
- **Scope:** production dependencies only (`--omit dev`), matching the blocking
  `npm audit --omit=dev` gate. Dev/test tooling is intentionally excluded.

The artifact uploads even when an audit step fails (`if: always()`), so the
component inventory is available precisely when investigating a failed scan.

## Schema build step

Prisma's schema is modular: sources live in `prisma/modules/*.prisma` and are
assembled into `prisma/schema.prisma` by `prisma/build-schema.mjs`. CI runs
`npm run prisma:generate` (build + `prisma generate`) then `npm run prisma:deploy`
(build + `prisma migrate deploy`). Migration failures are **not** swallowed — if
they were, the suite would explode downstream with "table does not exist".

## Schema drift check

Right after migrations apply, the `test` job runs `npm run prisma:drift`:
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
--exit-code`. The freshly migrated database holds exactly what the
migrations build, so any difference from the merged schema means a model
change shipped without its migration (or a migration without its model change).
Exit `2` fails the job and the step log prints the diff; fix it with
`npm run prisma:migrate -- --name <change>` and commit the generated migration.

It runs in `test` only — `test-no-redis` applies the same migrations to the same
schema, so a second check would add nothing. Run it locally against any
database that has had `npm run prisma:deploy` applied.

## Coverage gate

The `test` job runs the suite as `npm run test:coverage` (v8 provider) and
uploads `coverage/` as the `coverage-report` artifact (HTML report under
`coverage/index.html`). The denominator is every file under `src/` except tests,
`.d.ts` and `src/generated/`, so untested files count as 0% rather than being
silently left out.

Floors live in `vitest.config.ts` → `test.coverage.thresholds` and sit about one
point under the baseline measured on 2026-10-01:

| Scope        | Statements | Branches | Functions | Lines | Floor (S/B/F/L)   |
| ------------ | ---------- | -------- | --------- | ----- | ----------------- |
| all of `src` | 50.9       | 41.1     | 43.2      | 51.4  | 50 / 40 / 42 / 50 |
| `src/lib/**` | 75.4       | 64.3     | 76.6      | 76.7  | 74 / 63 / 75 / 75 |

The global number is low because pages and components (`src/app`,
`src/components`) are covered by the Playwright E2E job, not by unit tests;
`src/lib` is where business logic lives and carries the real bar. Treat the
floors as a ratchet: raise them when coverage climbs, and never lower them to
get a PR through — add tests instead.

It runs in `test` only. `test-no-redis` skips the queue/worker tests, so its
numbers would be lower and a second gate would just be noise. A local run takes
about 3–4 minutes and needs the same scratch Postgres/Redis as `npm test`.
