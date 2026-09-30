# Threat Model

This document describes AIGP-Lite's trust boundaries, the threats considered
for each, and the mitigations already in place. It is written for whoever has
to answer "what happens if X is compromised" during a customer security
review — a deployer, an auditor, or a future maintainer. It complements the
one-paragraph bullet list in [README.md § Security](README.md#security);
that list says _what_ exists, this document says _why_ and _what it does not
cover_.

Scope: the application and worker processes and their direct dependencies
(Postgres, Redis, the optional Moonshot/NeMo sidecars). Out of scope: the
security of the host OS, container runtime, or cloud provider — those are
the deployer's responsibility (see [docs/admin/README.md](docs/admin/README.md)).

## 1. System overview and trust boundaries

```
Browser ──HTTPS(reverse proxy)──▶ Next.js app ──▶ Postgres (per-org rows)
                                       │      ╲
                                       │       ╲──▶ Redis (BullMQ queue)
                                       │
                                       ├──▶ LLM providers (OpenAI/Anthropic/Azure/... )
                                       ├──▶ Slack / Teams / ServiceNow (egress)
                                       ├──▶ Audit sinks (webhook / syslog / Datadog)
                                       └──▶ Moonshot / NeMo sidecars (optional, opt-in)
```

The dominant trust boundary is **between organizations**, not between users
within an org — this is a multi-tenant SaaS-style app where every business
table carries an `orgId`, and the platform's core security promise is that
tenant A's data and secrets are never reachable from tenant B's session. A
secondary boundary is **role, within an org** (admin vs. viewer, etc.). A
third is **the network egress surface** — every outbound call the app makes
on a user's behalf.

## 2. Actors

| Actor                                                         | Capability                                         | Trust level                                               |
| ------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Unauthenticated visitor                                       | Can reach `/login`, `/api/auth/*`                  | None                                                      |
| Authenticated user (any role)                                 | Session JWT, scoped to their org(s) via Membership | Low–medium, varies by role                                |
| Org admin                                                     | Full RBAC within their own org (see §4)            | Medium, org-scoped                                        |
| Platform operator / DB admin                                  | Direct Postgres/Redis access, deploy pipeline      | Full — deliberately out of scope for in-app controls (§6) |
| External service (LLM provider, Slack, ServiceNow, SIEM sink) | Receives outbound requests/webhooks from the app   | Semi-trusted, egress-only in most flows                   |

## 3. Authentication

NextAuth.js, JWT (stateless) session strategy (`src/lib/auth/auth.ts`) — chosen
so multi-replica deployments need no shared session store (`docs/admin/README.md`
§11 confirms "JWT 模式，stateless，多副本无需共享 session 存储").

- **Credentials provider**: password hashed with Argon2id, verified via
  `argon2.verify()` (`src/lib/auth/password.ts`).
- **OIDC/SSO** (optional, per-org, `SsoConnection` table): PKCE + state
  checks enabled (`src/lib/auth/sso/provider.ts`). JIT provisioning maps the
  OIDC `sub` claim to a user and can auto-assign org/role from group claims
  (`src/lib/auth/sso/jit.ts`, `src/lib/auth/sso/config.ts`).
- **API keys** (for the runtime LLM proxy, not human login): `aigp_`-prefixed
  random token, stored as a SHA-256 hash with a stored prefix for
  reveal-once display, never the raw key (`src/lib/api-key/manage.ts`).

**Threats considered:**

- _Credential stuffing / brute force_ — authentication and runtime LLM limits
  still belong at the reverse-proxy/API-key layer; public Trust Center and
  external-report endpoints now use an optional Redis-backed application limit.
- _Token theft via XSS_ — JWT is delivered as an HTTP-only cookie by
  NextAuth; combined with the CSP below, reduces (not eliminates) the blast
  radius of a script-injection bug.
- _OIDC misconfiguration_ — PKCE/state are enforced in code, not optional
  per deployment, so a misconfigured issuer fails closed rather than
  silently degrading to implicit-flow-style risk.

## 4. Authorization (RBAC)

Five fixed roles — `admin`, `risk_officer`, `ai_owner`, `auditor`, `viewer`
(`src/lib/rbac/roles.ts`) — mapped to a permission matrix covering ~30
resources (`Record<Role, Set<Permission>>` in the same file).

**Enforcement is server-side only.** Every tRPC procedure and API route calls
`assertPermission(role, permission)`, which throws before touching data.
Client-side `hasPermission()` calls exist purely to hide UI affordances
(buttons, nav items) for a role that couldn't use them anyway — removing
those checks would be a UX regression, not a security hole, because the
server-side gate is what actually protects data. Permission denials are
themselves captured to the audit log (`src/middleware/audit.ts`).

**Threat considered:** a compromised or buggy client (malicious browser
extension, tampered request) cannot escalate privilege by skipping
client-side checks, because there is nothing privileged for the client to
skip past — the server never trusts the client's role claim beyond the
signed session token.

**Not modeled:** a role's _scope_ is intentionally coarse (five fixed roles,
no per-resource ACLs). If a customer needs finer-grained delegation (e.g.
"this ai_owner may only see usecase X"), that's a feature gap, not a
vulnerability — track it as a product request, not a threat-model finding.

## 5. Multi-tenant isolation

Every model with a non-nullable `orgId` is registered in `ORG_SCOPED`
(`src/lib/db/orgIsolation.ts`) — a Prisma client extension that:

- injects `orgId` into every `create`/`createMany` and throws on mismatch,
- injects `WHERE orgId = <session org>` into every `find*`/`update*`/
  `delete*`/`count`/`aggregate`/`upsert`,
- is kept honest by `orgIsolation.test.ts`, which fails the build if a new
  required-`orgId` model is added to the schema without being added to
  `ORG_SCOPED` — this is the control that stops the isolation set from
  silently rotting as the schema grows.

**Known, deliberate exception:** `RiskCatalog` has a nullable `orgId`
(global catalog rows plus org-specific overrides coexist); call sites
explicitly OR the global and org-scoped rows rather than relying on the
blanket extension. This is documented in-line in `orgIsolation.ts` and is
the only model that opts out of automatic scoping.

**Threat considered:** a request handler that forgets to scope a query
cannot leak cross-org data by omission, because the extension injects the
filter automatically rather than relying on every call site remembering to
add `where: { orgId }` by hand. The residual risk is a handler that
_deliberately_ bypasses the extension with a raw `$queryRaw`/`$executeRaw`
call — none were found outside the audit-log advisory-lock helper, which
uses `$executeRaw` only for `pg_advisory_xact_lock()` (lock scoping, not
data access) and does not read or write tenant rows through it.

## 6. Secrets at rest

AES-256-GCM (`src/lib/crypto/secrets.ts`), 12-byte IV, 16-byte auth tag.
Encrypted blobs: `ProviderConnection.credentialsEncrypted` (LLM provider API
keys), `EnterpriseIntegration.credentialsEncrypted` (Slack/Teams/ServiceNow
secrets), `SsoConnection` client secret, `AuditSink.secretsEncrypted` (SIEM
sink tokens/API keys).

- **Key source**: `AIGP_ENCRYPTION_KEY` env var, must base64-decode to 32
  bytes; the app **throws on first use** if unset in production. In
  non-production, a deterministic key is derived from
  `AIGP_ENCRYPTION_SEED` (or a fixed default) purely so local dev doesn't
  need a real secret — this fallback is refused outright once
  `NODE_ENV === "production"`.
- **Never sent to the client**: every read path that surfaces a
  `ProviderConnection`/`AuditSink`/etc. to the UI strips the encrypted
  field before serialization; decryption only happens in server-only code
  paths (`src/lib/audit/log.ts`, the runtime LLM route, the redteam stream
  route).

**Threats considered:**

- _Database dump exfiltration_ — an attacker with read access to Postgres
  alone (backup theft, replica leak) gets ciphertext, not usable
  credentials, provided the encryption key was never also exposed.
- _Key rotation_ — `pnpm crypto:rotate-key` re-encrypts all four encrypted
  columns in place (offline, idempotent; dual-env contract
  `AIGP_ENCRYPTION_KEY_OLD` + `AIGP_ENCRYPTION_KEY`); runbook in
  `docs/admin/README.md` §13.7. Rotation still needs a brief app stop —
  there is deliberately no dual-key runtime, which is acceptable for the
  current single-instance deployment.

## 7. Egress / outbound requests (SSRF surface)

The app makes outbound requests to: LLM providers, Slack/Teams incoming
webhooks, ServiceNow (basic auth), and audit sinks (webhook/syslog/Datadog).

- Provider- and integration-bound requests use credentials the org itself
  configured — an org can only ever point its own connections at endpoints
  its own admin chose, which bounds the blast radius to self-inflicted
  misconfiguration, not cross-tenant abuse.
- Outbound webhook delivery is HMAC-SHA256 signed
  (`src/lib/integrations/delivery.ts`, `X-AIGP-Signature` header) so a
  receiving endpoint can verify the payload came from this app and wasn't
  tampered with in transit.
- Inbound ServiceNow sync verifies `X-Webhook-Secret` with a timing-safe
  comparison (`node:crypto.timingSafeEqual`), preventing a timing side
  channel on secret comparison.

**Mitigated (2026-07):** all four org-configurable outbound surfaces (audit
sinks, org webhook endpoints, enterprise integrations' `webhookUrl` /
`instanceUrl`, LLM provider `baseUrl`) are validated by
`src/lib/egress/guard.ts` — at creation time (tRPC `BAD_REQUEST` with a
remediation hint) **and** again before every delivery (DNS-rebinding
defense). The guard denies loopback, RFC1918, link-local (incl. cloud
metadata `169.254.169.254`), CGNAT, ULA and unspecified ranges for IPv4 and
IPv6 (IPv4-mapped IPv6 is unwrapped), rejects non-http(s) schemes and
userinfo URLs, resolves **all** A/AAAA records and blocks if any is private,
and never follows redirects (`redirect: "manual"`, 3xx = delivery failure).
Deployment operators — not org admins — can permit legitimate internal
destinations via the `AIGP_EGRESS_ALLOWLIST` env var (comma-separated CIDRs,
exact IPs, exact hostnames, or `*.wildcard` hostnames; invalid entries are
logged and ignored).

**Residual risk:** a TOCTOU window remains between the guard's DNS check and
fetch's own resolution (defeating it would require IP pinning via a custom
undici dispatcher — disproportionate for this threat actor, who is an org
admin misusing their own permission). **Named follow-up:**
`SsoConnection.issuer` is admin-configured but consumed by NextAuth's OIDC
discovery, not our fetch code, and remains unguarded.

Operator-scoped outbound calls (e.g. `AIGP_ABORT_REDIS_REST_URL` in the
redteam abort-flags Redis client, and the Risk-Copilot/Drift/Policy-assistant
LLM calls that read their provider URL from operator env vars) are
deliberately excluded from the egress guard: their destinations come from
operator-controlled deployment config, not org-admin input, so they sit
outside this threat model's trust boundary.

## 8. Audit log tamper evidence

Every mutation writes an `AuditLog` row via `writeAudit()` with sensitive
fields (password/secret/apiKey/csrf patterns) redacted before the row is
even hashed (`src/lib/audit/hash.ts`). Each row's `selfHash` is
`sha256(stableStringify({orgId, actorId, action, resourceType, resourceId,
beforeJson, afterJson, ip, userAgent, ts, seqNum, prevHash}))` — a
canonical, recursively-key-sorted JSON encoding so the hash is deterministic
regardless of object key insertion order. `seqNum` is assigned per-org under
a Postgres advisory lock to prevent write races from producing duplicate or
out-of-order sequence numbers. Design adapted from the Microsoft Agent
Governance Toolkit, credited in-line in `hash.ts`.

**What this protects against:** any row's content, or its position in the
sequence, being altered _after the fact without also having to recompute
every subsequent row's hash_ — a partial tamper (edit one row, leave the
rest) breaks the chain and is caught by the verifier (`src/lib/audit/verify.ts`).

**What this does NOT protect against — call this out explicitly to anyone
relying on it for compliance evidence:** a party with direct write access to
the Postgres audit table (a DB admin, a compromised backup restore) can
recompute the _entire_ chain from a tampered point forward and produce a
new, internally-consistent chain that verifies cleanly. This is a
tamper-**detection** design (proves nothing was altered _without leaving DB
admin-level fingerprints_), not a cryptographic tamper-**proof** design (which
would require an external, independent witness — e.g. periodically
publishing the latest `selfHash` to a system the DB admin doesn't control).
If a customer's compliance requirement is "provably immutable even against
our own DBA," that requires an add-on (external anchoring), which does not
exist today.

## 9. Background jobs (BullMQ/Redis)

Job payloads are typed, application-constructed objects (never raw
user-supplied strings deserialized into code) — `src/lib/jobs/enqueue.ts`
enumerates the fixed set of job types (`drift.run`, `incident.maybe-open`,
`webhook.deliver`, etc.), each with its own typed processor in
`src/worker/processors`. There is no dynamic job-type or arbitrary-code
execution path. When `REDIS_URL` is unset, the same processor runs inline in
the request process (`docs/ci.md` documents both paths are covered in CI) —
this is a deployment-mode difference, not a security difference, since the
same typed processor code runs either way. Public rate-limit buckets are
Redis-backed when configured; a Redis outage fails closed in production so
multi-instance deployments cannot bypass the limit.

## 10. File uploads (Evidence module)

`src/lib/storage.ts`: 25 MiB size cap, MIME-type allowlist (PDF, PNG, JPEG,
GIF, TXT, CSV, JSON, ZIP, XLSX — no executable or script MIME types), stored
under `./storage/evidence/<orgId>/<random-id>.<ext>` on local disk, with a
SHA-256 checksum verified on download. Retrieval goes through the same
`ORG_SCOPED`-enforced Prisma read as everything else, so a user cannot fetch
another org's evidence file by guessing/enumerating an ID.

**Deployment modes:** local-disk storage remains the default for development and
single-instance deployments. For multi-replica deployments, configure the
S3-compatible backend described in `docs/admin/README.md` §11; the storage key
is persisted in the same evidence record and checksum verification remains
mandatory on download.

## 11. Explicit non-goals / accepted risk

These are deliberate, not oversights — listed so a security reviewer doesn't
have to rediscover them:

- **Authentication and runtime LLM rate limiting remain deployment concerns.**
  Configure the reverse proxy for `/api/auth/*` and use API-key budget controls
  for `/api/runtime/llm`. Public Trust Center and external-report endpoints use
  the optional Redis-backed limiter in `src/lib/rate-limit/tokenBucket.ts`.
- **Key rotation requires an operator-run maintenance step.** Use the built-in
  `pnpm crypto:rotate-key` script with the documented dual-key contract before
  cutting over `AIGP_ENCRYPTION_KEY`; verify `failed=0` and remove the old key
  after completion.
- **Postgres/Redis are assumed not internet-exposed.** The app does not
  defend against an attacker who already has network access to the
  database or queue — that's the deployer's network boundary to hold
  (`docs/admin/README.md` §2, managed Postgres + Redis behind private
  networking).
- **DB/platform admins are fully trusted.** Every control in this document
  assumes the threat comes from outside that trust boundary (another
  tenant, an unauthenticated attacker, a compromised low-privilege
  session) — not from someone who already holds infrastructure-level
  access. See §8 for the specific consequence on audit tamper-evidence
  claims.
- **Third-party dependency posture.** Production dependency vulnerabilities are
  gated in CI (`dependency-scan` job, see `docs/ci.md`); weekly Dependabot PRs
  handle routine bumps. A CycloneDX SBOM of production dependencies is
  generated on every CI run and published as the `sbom-cyclonedx` build
  artifact, providing an auditable component inventory alongside the
  dependency vulnerability scan and Dependabot update flow.

## 12. Reporting a vulnerability

If you find a gap not covered above, treat it the same as any other
security-relevant bug in this repository: file it privately rather than as
a public issue if it's exploitable in a current deployment, and include
enough reproduction detail (role, org context, request) for the trust
boundary it crosses to be clear from your report.
