# E2E Baseline Failures — Triage (2026-07-09)

**Context.** The Playwright E2E harness was fully broken from the Prisma 7 migration
(PR #34, 2026-07-02) until 2026-07-09, when the `moduleFormat = "cjs"` generator fix
(`prisma/core.prisma`) unblocked it. Because nothing ran for ~a week, the baseline specs
accumulated drift. First green-harness run:

> **40 passed / 19 failed / 1 skipped.**

The **v0.23.0 new-module specs (m13–m16) are all green (14/14)** and are **not** in this
list. Every failure below is **pre-existing** and unrelated to the CJS change (proof:
unit 1940/1940 + the 14 new E2E specs all pass). This doc scopes the 19 into fix
workstreams for a separate pass. Per-test attribution is best-effort — the `list`
reporter interleaves WebServer console errors, so confirm each test's true cause when
you pick it up.

## Workstream A — hardcoded `:3000` / IPv6 `::1` in request context (config)

Tests build an `apiRequestContext` / navigate to `http://localhost:3000` (or resolve
`::1:3000`) while the dev server is on **3001** → `ECONNREFUSED` / `ERR_CONNECTION_REFUSED`.
Likely a shared request-context helper or a stale base URL constant.

- `auth.spec.ts:7` register → login → dashboard → logout (`page.waitForURL: net::ERR_CONNECTION_REFUSED`)
- `m2-playground-blocked.spec.ts:52` playground blocks SSN (`apiRequestContext.post: ECONNREFUSED ::1:3000`)
- `m10-finops.spec.ts:14` hardCap 429 on `/api/runtime/llm`
- `m11-connectors.spec.ts:50` ServiceNow inbound rejects bad secret (401)
- `m11-connectors.spec.ts:81` ServiceNow inbound not_found (`ECONNREFUSED ::1:3000`)
- `m12-redteam.spec.ts:16` jailbreak eval → findings → model card (`ECONNREFUSED ::1:3000`)

**Fix direction:** route all `request`/`apiRequestContext` calls through the Playwright
`baseURL` (3001) or `process.env`; force IPv4 `127.0.0.1` if `::1` is the problem.

## Workstream B — zh i18n missing / malformed keys (production `messages/`)

Missing or mis-typed zh message keys crash page render (`MISSING_MESSAGE` /
`INSUFFICIENT_PATH`), cascading into visibility/timeout failures.

- `maturity.scoreLabels` resolves to an **object**, not a string (needs a nested `.` path
  or flattening) → `m-maturity.spec.ts:6`, `m-maturity.spec.ts:14`
- `inventory.addVersion`, `inventory.noVersions` missing → `m1-inventory-risk.spec.ts:6`
- `provider.catalog.customOpenai.{name,description}`, `provider.catalog.azureOpenai.{name,description}` missing → `m8-provider-connection.spec.ts:14`
- Also surfaced as WebServer console errors (may or may not fail a listed test, but are real gaps): `finops.title`, `notifications.emptyHint`, `dossier.checks.alignment_audit.{label,detail}`

**Fix direction:** add the missing keys to `messages/zh.json` (+ en parity); change the
`maturity.scoreLabels` lookup to address nested messages correctly.

## Workstream C — selector / form drift (test updates)

`selectOption` / locator timeouts against form controls that have changed markup
(e.g. `select[name="autonomyLevel"]`, generic `select`).

- `m3-workflow.spec.ts:6` usecase promotion dev→prod (`toHaveCount` mismatch + select)
- `m8-provider-connection.spec.ts:14` (also Workstream B)
- `risk-copilot.spec.ts:7` admin sees AI Risk Suggestions panel
- `risk-copilot.spec.ts:33` viewer sees disabled suggest button
- `m-policy.spec.ts:14` policy CRUD create via form

**Fix direction:** re-derive selectors from current component markup.

## Workstream D — seed / suggestion data drift (test updates)

- `getByText("Demo CRM Export")` now matches **2** rows (strict-mode violation) — scope the
  locator → `data-lineage-linking.spec.ts:7`, `incident-dedup-merge.spec.ts:126`
- dedup/copilot suggestions not generated ("merge suggestion should be created",
  "suggestion should exist") — embedding/seed dependent → `incident-dedup-merge.spec.ts:40`,
  `incident-dedup-merge.spec.ts:126`

**Fix direction:** scope locators; verify the embedding provider seed
(`supportsEmbeddings` on Demo Org's `mock-local`, set in `global-setup.ts`) actually
produces suggestions in this environment.

## Workstream E — visual + misc

- `visual-baseline.spec.ts:24` incident-detail.png darwin snapshot diff — **regenerate
  baseline** (`--update-snapshots`) after confirming the page is correct.
- `auth.spec.ts:57` `/login respects prefers-reduced-motion` — `reducedAttr` expected
  `"true"`; check the attribute wiring.
- Hydration mismatches (×3 in console) — SSR/client text mismatch; track down the
  offending Client Component.

## Not to re-investigate

- The `import.meta` harness blocker is **fixed** (`moduleFormat = "cjs"`). Do not revert.
- m13–m16 are green; they are the reference for correct new-spec patterns
  (seed-state, `dotenv/config` in `helpers/demo.ts`, id-scoped detail anchors).
