# AIGP-Lite

[![CI](https://github.com/pz1130/aigp-lite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pz1130/aigp-lite/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/pz1130/aigp-lite)](https://github.com/pz1130/aigp-lite/releases/latest)

Modular AI Governance Platform aligned with the EU AI Act, NIST AI RMF, and
ISO/IEC 42001. Ships built-in control/risk catalogs from FINOS AIGF, NIST AI
RMF, ISO 42001 (Annex A), MITRE ATLAS, EU AI Act (Reg. 2024/1689), MAS/ABS
MindForge and OWASP Agentic Security Initiative (ASI01–ASI10), plus testing
checklists from Singapore IMDA's AI Verify (AIVTF) and MindForge, and frontier
governance templates inspired by the OpenAI Frontier Governance Framework
(Frontier Risk Tier + Transparency Report) and an original-wording agentic
use-case governance checklist. Red-team runs can be judged by an optional NVIDIA
NeMo Guardrails sidecar. Current release: **v0.24.0** · 28 modules.

> **On the name & scope.** "AIGP-Lite" is the original project codename, not a
> statement of size. This is a **full multi-module governance platform** —
> 28 sidebar modules, two optional AI sidecars (Moonshot red-team engine, NeMo
> Guardrails judge), a BullMQ/Redis background worker, 7 framework catalogs, a
> Merkle-chained audit log, and SSO/OIDC. Plan for a real deployment (Postgres +
> Redis + secrets), not a single-binary toy. See [Deployment modes](#deployment-modes)
> and the [Capability maturity matrix](#capability-maturity) for what's GA vs. newer.

## 📚 文档 / Documentation

| 文档                                                 | 适合谁                   | 内容                                                                                |
| ---------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| **[用户手册 / User Guide](docs/user/README.md)**     | 所有终端用户（5 个角色） | 登录、权限矩阵、模块怎么用、典型工作流、常见问题                                    |
| **[管理员手册 / Admin Guide](docs/admin/README.md)** | DevOps / 系统管理员      | 部署、环境变量、用户管理、Provider 配置、连接器对接、备份恢复、升级、监控、故障排查 |
| **[本 README](#quickstart-docker)**                  | 第一次接触项目的人       | 5 分钟跑起来 + 架构速览                                                             |

> 演示账号见下方 [Demo accounts](#demo-accounts-seeded-automatically)。

---

## Deployment modes

Pick the mode that matches your intent — they differ in what infrastructure and
secrets you must provide:

| Mode           | Command                                                                                                                                  | DB / Redis                                              | Secrets you must set                                                                                                                                                         | AI sidecars                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **POC / demo** | `docker compose up --build`                                                                                                              | bundled Postgres + Redis                                | `NEXTAUTH_SECRET`, `AIGP_ENCRYPTION_KEY`                                                                                                                                     | Moonshot + NeMo containers start by default (see note below) |
| **Local dev**  | `docker compose up -d db` + `npm run dev`                                                                                                | bundled Postgres only; Redis optional (inline fallback) | `NEXTAUTH_SECRET`, `AIGP_ENCRYPTION_KEY`                                                                                                                                     | none unless you set `AIGP_MOONSHOT_URL` / `AIGP_NEMO_URL`    |
| **Production** | your orchestrator, or `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` ([docs/deployment.md](docs/deployment.md)) | managed Postgres **+ Redis** (run the `worker` process) | `NEXTAUTH_SECRET`, `AIGP_ENCRYPTION_KEY` (32-byte base64, **required** — the app throws on first provider-secret use without it), `NEXTAUTH_URL`, plus any provider/SSO vars | opt-in via env                                               |

> The dev server runs on **port 3001** (`next dev -p 3001`); the Docker/production
> server runs on **3000**. The 3001 port is also what the Playwright e2e harness
> targets — don't change it without updating `playwright.config.ts`.

## Quickstart (Docker)

```bash
cp .env.example .env
# generate the two required secrets (overwrite the .env placeholders, don't append):
sed -i.bak "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -base64 32)|" .env
sed -i.bak "s|^AIGP_ENCRYPTION_KEY=.*|AIGP_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
rm -f .env.bak

docker compose up --build
```

`AIGP_ENCRYPTION_KEY` must decode to 32 bytes; it encrypts provider credentials
at rest. Without it, the app boots but throws the moment anyone configures a
provider connection. (In local dev you may omit it — a deterministic dev key is
derived from `AIGP_ENCRYPTION_SEED`.)

Open http://localhost:3000 — you'll be redirected to `/zh`.

### Demo accounts (seeded automatically)

| Email                     | Password   | Role         |
| ------------------------- | ---------- | ------------ |
| `admin@demo.local`        | `demo1234` | admin        |
| `risk_officer@demo.local` | `demo1234` | risk_officer |
| `ai_owner@demo.local`     | `demo1234` | ai_owner     |
| `auditor@demo.local`      | `demo1234` | auditor      |
| `viewer@demo.local`       | `demo1234` | viewer       |

Demo accounts are created only when `AIGP_SEED_DEMO` is on (the default outside
`NODE_ENV=production`). Re-running the seed never resets an existing user's
password. The production compose override sets `AIGP_SEED_DEMO=0`.

## Quickstart (local dev, against dockerized DB)

Node **22 or newer** (`engines` enforces the floor; `.nvmrc` pins the version CI
and the Docker image use — `nvm use` picks it up).

```bash
docker compose up -d db
cp .env.example .env
# .env's DATABASE_URL points at host "db" (docker-internal). For host-side tools, use localhost:
sed -i.bak 's|@db:5432|@localhost:5432|' .env
# generate a real session secret (overwrite the placeholder, don't append):
sed -i.bak "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -base64 32)|" .env
rm -f .env.bak
# AIGP_ENCRYPTION_KEY may be left blank in dev (a dev key is derived from AIGP_ENCRYPTION_SEED).

npm install
npm run prisma:migrate -- --name init   # only on first run
npm run prisma:seed                     # only on first run
npm run dev                             # dev server on http://localhost:3001
```

## Setting up provider connections (M8+)

LLM provider credentials are now per-organization, stored AES-256-GCM
encrypted at rest, and managed through the UI. The old
`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` env vars are no longer used.

### 1. Generate the master encryption key

```bash
openssl rand -base64 32
```

Set it in your deployment environment as `AIGP_ENCRYPTION_KEY`. It must
decode to 32 bytes. Rotating this key invalidates all existing connections
(re-encryption is a v0.3 feature).

For local development, if `AIGP_ENCRYPTION_KEY` is intentionally omitted,
the app derives a deterministic dev key from `AIGP_ENCRYPTION_SEED` (or
`aigp-dev-default`).

### 2. Create your first connection

After login → **Integrations → Provider Connections → New Connection**.

Pick from the catalog (OpenAI, Anthropic, Azure OpenAI, Google Gemini,
DeepSeek, Qwen, Kimi, ChatGLM, MiniMax, Doubao, Wenxin, Ollama, or a
custom OpenAI-compatible / Anthropic-compatible endpoint), give it a
name, paste the key. The system pings the upstream immediately and
reports back.

### Upgrading from v0.1.0

If you previously set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in env:

1. Generate `AIGP_ENCRYPTION_KEY` as above and add it to your env.
2. Remove the old env vars.
3. Log in as admin and create one ProviderConnection per upstream provider.

No automatic migration is provided — env vars have no org affinity, so
mapping them to ProviderConnection rows requires explicit operator choice.

## Scripts

| Command                              | What                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| `npm run dev`                        | Next.js dev server (port **3001**)                                   |
| `npm run build` / `npm start`        | Production build + serve                                             |
| `npm test`                           | Vitest unit tests                                                    |
| `npm run e2e`                        | Playwright end-to-end                                                |
| `npm run typecheck`                  | `tsc --noEmit`                                                       |
| `npm run lint`                       | ESLint + Prettier checks                                             |
| `npm run prisma:migrate`             | Build merged schema + run migrations                                 |
| `npm run prisma:seed`                | Insert demo org + role users                                         |
| `npm run prisma:studio`              | Open Prisma Studio                                                   |
| `npm run openapi:export`             | Regenerate `openapi.json`                                            |
| `npm run worker`                     | Start the BullMQ background worker (drift / incident / redteam jobs) |
| `npm run worker:smoke`               | Worker health-check smoke test (skipped when no Redis)               |
| `npm run frameworks:status`          | List installed framework catalogs + versions                         |
| `npm run finos:import`               | (Re)import the FINOS AIGF risk/control catalog                       |
| `npm run atlas:backfill`             | (Re)import the MITRE ATLAS catalog + cross-links                     |
| `npm run nist:import`                | (Re)import the NIST AI RMF catalog                                   |
| `npm run iso42001:import`            | (Re)import the ISO/IEC 42001 Annex A catalog                         |
| `npm run euaiact:import`             | (Re)import the EU AI Act (Reg. 2024/1689) catalog                    |
| `npm run mindforge:import`           | (Re)import the MAS/ABS MindForge risk catalog (+ crosswalk)          |
| `npm run mindforge-checklist:import` | (Re)import the MindForge Gen-AI guardrails checklist                 |
| `npm run agentic-governance:import`  | (Re)import the agentic use-case governance checklist catalog         |
| `npm run aivtf:import`               | (Re)import the AI Verify (AIVTF) testing checklist catalog           |
| `npm run imda:import`                | (Re)import the IMDA model-card / coverage data                       |
| `npm run audit:backfill`             | Backfill Merkle hash chain on existing audit rows                    |

### Optional AI module env vars

| Module           | Variable                            | Required | Notes                                                                                                                                                    |
| ---------------- | ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Risk Copilot** | `RISK_COPILOT_PROVIDER`             | yes      | `anthropic` \| `openai` \| `google`                                                                                                                      |
|                  | `RISK_COPILOT_API_KEY`              | yes      |                                                                                                                                                          |
|                  | `RISK_COPILOT_MODEL`                | yes      | e.g. `claude-opus-4-7`                                                                                                                                   |
| **Incident RCA** | `INCIDENT_RCA_PROVIDER`             | yes      | `anthropic` \| `openai` \| `google`                                                                                                                      |
|                  | `INCIDENT_RCA_API_KEY`              | yes      |                                                                                                                                                          |
|                  | `INCIDENT_RCA_MODEL`                | yes      | e.g. `claude-opus-4-7`                                                                                                                                   |
| **NL→Policy**    | `AIGP_ASSISTANT_PROVIDER`           | yes      | `anthropic` \| `openai` \| `google`                                                                                                                      |
|                  | `AIGP_ASSISTANT_<PROVIDER>_KEY`     | yes      | e.g. `AIGP_ASSISTANT_ANTHROPIC_KEY` for the chosen provider                                                                                              |
|                  | `AIGP_ASSISTANT_<PROVIDER>_MODEL`   | yes      | e.g. `AIGP_ASSISTANT_ANTHROPIC_MODEL=claude-opus-4-7`                                                                                                    |
| **Drift**        | `AIGP_DRIFT_JUDGE_PROVIDER`         | yes      | `anthropic` \| `openai` \| `google`                                                                                                                      |
|                  | `AIGP_DRIFT_JUDGE_<PROVIDER>_KEY`   | yes      | e.g. `AIGP_DRIFT_JUDGE_ANTHROPIC_KEY` for the chosen provider                                                                                            |
|                  | `AIGP_DRIFT_JUDGE_<PROVIDER>_MODEL` | yes      | e.g. `AIGP_DRIFT_JUDGE_ANTHROPIC_MODEL=claude-opus-4-7`                                                                                                  |
| **Egress guard** | `AIGP_EGRESS_ALLOWLIST`             | no       | Comma-separated CIDRs / IPs / hostnames / `*.wildcard` hostnames exempt from the outbound SSRF guard. Unset = all private/internal destinations blocked. |

> **Two naming schemes (historical).** The older modules (Risk Copilot, Incident
> RCA) read a single flat `<MODULE>_API_KEY`. The newer modules (NL→Policy, Drift)
> read **per-provider** keys: set `<PREFIX>_PROVIDER` to choose the provider, then
> supply `<PREFIX>_<PROVIDER>_KEY` and `<PREFIX>_<PROVIDER>_MODEL` for that one
> provider (e.g. for `AIGP_DRIFT_JUDGE_PROVIDER=anthropic`, set
> `AIGP_DRIFT_JUDGE_ANTHROPIC_KEY` + `AIGP_DRIFT_JUDGE_ANTHROPIC_MODEL`). These
> are the exact names the code reads (`src/lib/drift/config.ts`,
> `src/lib/policy-assistant/router.ts`) — a missing var throws at use time.

> **Upgrade note (egress guard):** outbound destinations configured by org
> admins (audit sinks, webhooks, integrations, provider base URLs) are now
> validated against private/internal IP ranges at save time **and** before
> every delivery. Existing rows pointing at internal hosts will start
> failing at delivery — add them to `AIGP_EGRESS_ALLOWLIST` if they are
> intentional. Local-dev setups pointing providers at localhost need
> `AIGP_EGRESS_ALLOWLIST=127.0.0.1/32,localhost` in `.env`.

### SSO / OIDC (optional)

Set the following environment variables to enable enterprise SSO via OIDC:

| Variable                   | Required | Notes                                                     |
| -------------------------- | -------- | --------------------------------------------------------- |
| `SSO_OIDC_ISSUER`          | yes      | e.g. `https://idp.example.com`                            |
| `SSO_OIDC_CLIENT_ID`       | yes      |                                                           |
| `SSO_OIDC_CLIENT_SECRET`   | yes      |                                                           |
| `SSO_OIDC_ORG_ID`          | yes      | cuid of an existing Organization row                      |
| `SSO_OIDC_ALLOWED_DOMAINS` | no       | comma-separated email domains; empty = allow all verified |
| `SSO_OIDC_BUTTON_LABEL`    | no       | defaults to `Sign in with SSO`                            |

First-time SSO users are auto-provisioned as `viewer` in `SSO_OIDC_ORG_ID`.
Credentials login remains available unless explicitly disabled. PKCE is on by default.

Beyond env-based config, admins can self-manage an org's IdP from the UI at
**Settings → SSO** (DB-backed `SsoConnection`, client secret AES-256-GCM
encrypted, JIT role-from-groups mapping, masked-secret + rotate). See
[`docs/sso.md`](docs/sso.md).

### SCIM Provisioning (optional)

AIGP-Lite supports SCIM 2.0 push provisioning so an identity provider
(Okta, Azure AD, etc.) can automatically create, update, and deactivate members
in your org. Configure the SCIM connection and role mappings from the UI at
**Settings → SCIM** and generate a bearer token to configure in your IdP. See
[`docs/scim.md`](docs/scim.md).

### Background worker & Redis (optional)

Drift runs, the incident pipeline, and Moonshot red-team runs are offloaded to
a BullMQ worker instead of fire-and-forget promises.

| Variable                  | Required | Notes                                                                                                                                                                        |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`               | no       | e.g. `redis://localhost:6379`. **Unset → inline fallback** (jobs run in-process; fine for dev/CI). Set → real queue, run `npm run worker` (or the `worker` compose service). |
| `AIGP_WORKER_CONCURRENCY` | no       | parallel jobs per worker (default 2)                                                                                                                                         |

### AI red-team engine — Moonshot (optional)

| Variable            | Required | Notes                                                                                                                                                                                                  |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AIGP_MOONSHOT_URL` | no       | Base URL of the AI Verify Moonshot sidecar (e.g. `http://moonshot:5000`). **Set → dynamic Moonshot engine ON** and the static prompt library is disabled; unset → built-in static prompt library only. |

**Container vs. feature.** `docker-compose.yml` has no `profiles:`, so the
`moonshot` container **does start** on a plain `docker compose up` (its port is
just not published to the host), and `web`/`worker` default `AIGP_MOONSHOT_URL`
to `http://moonshot:5000` — i.e. the dynamic engine is **on by default** in the
bundled stack. It is "optional" only in that you can disable it (set
`AIGP_MOONSHOT_URL=`) or remove the service; the app degrades to the built-in
static prompt library. See [`docs/moonshot-integration.md`](docs/moonshot-integration.md).

### AI red-team judge & HITL evidence — NeMo Guardrails (optional)

NVIDIA NeMo Guardrails (Apache-2.0) runs as an internal sidecar serving two
**orthogonal** roles: (1) an alternative **judge** for red-team runs — the run
_engine_ stays `builtin`, NeMo only decides pass/fail; and (2) a **HITL /
kill-switch reference control** whose verify-demo transcript is captured as EU
AI Act Article 14 evidence (additive traceability — it never changes a control's
derived status).

| Variable               | Required | Notes                                                                                                     |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `AIGP_NEMO_URL`        | no       | Base URL of the NeMo sidecar (e.g. `http://nemo:9000`). **Presence enables the judge**; empty = disabled. |
| `AIGP_NEMO_API_KEY`    | no       | Optional bearer token, sent as `Authorization: Bearer <key>`.                                             |
| `AIGP_NEMO_CONFIG_ID`  | no       | Judge config id (default `aigp_judge`).                                                                   |
| `AIGP_NEMO_TIMEOUT_MS` | no       | Request timeout in ms (default `60000`).                                                                  |

The `nemo` service in `docker-compose.yml` is default-on (defaults
`AIGP_NEMO_URL` to `http://nemo:9000`); set `AIGP_NEMO_URL=` to disable. The
bundled rails use OpenAI models, so the sidecar needs `OPENAI_API_KEY` to
actually evaluate — without it, calls degrade safely (judge returns an `error`
verdict, runs are never silently passed). See
[`docs/nemo-integration.md`](docs/nemo-integration.md) (中文：
[`docs/nemo-integration.zh.md`](docs/nemo-integration.zh.md)) and the verified
HTTP contract in [`docs/nemo-real-api-contract.md`](docs/nemo-real-api-contract.md).

## Modules

28 modules registered in `src/lib/modules/registry.ts` (sidebar nav):

| Module (nav label)      | Description                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AI Inventory**        | AI usecase registry with model cards, lifecycle stages, autonomy levels                                                                                                              |
| **Team Members**        | Org members, role assignment, invitations                                                                                                                                            |
| **Risk & Regulations**  | EU AI Act / NIST AI RMF / ISO 42001 control assessment + risk scoring; AI Risk Copilot suggests risks/mitigations from the catalog                                                   |
| **Governance Maturity** | ISO 42001 6-pillar governance maturity assessment                                                                                                                                    |
| **Vendors**             | Third-party AI vendor inventory — contract terms, data-residency, risk attributes                                                                                                    |
| **Policies**            | Real-time LLM prompt/output policy engine with Playgrounds + NL→policy authoring                                                                                                     |
| **Workflow**            | Multi-step promotion workflow with approval gates + inbox/bell notifications                                                                                                         |
| **Evidence**            | Immutable evidence file storage with SHA-256 integrity                                                                                                                               |
| **Audit Log**           | Merkle-chained audit browser (per-row SHA-256, verifier) with CSV export                                                                                                             |
| **Data Lineage**        | Data source tracking with ReactFlow visualization                                                                                                                                    |
| **Integrations**        | Webhooks + enterprise connectors (Slack / Teams / ServiceNow bidirectional)                                                                                                          |
| **AI Provider**         | Multi-tenant provider gateway (13+ providers, AES-256-GCM at rest)                                                                                                                   |
| **Incidents**           | Incident management with category taxonomy, framework refs, SLA, AI root-cause drafts                                                                                                |
| **Incident Trends**     | Versioned incident-trend analysis — embedding-cluster incidents → LLM root-cause themes, period deltas, worsening-trend alerts on publish                                            |
| **Compliance Reports**  | Report generation (NIST / ISO 42001 / ISO 27001 / SOC 2 Type 2 / EU AI Act / MindForge) + FRIA; EU AI Act obligations surface NeMo guardrail evidence                                |
| **Finops**              | AI cost tracking, budgets, pricing catalog, reliability layer                                                                                                                        |
| **AI Trust**            | Red-team evaluation (built-in or optional Moonshot engine; built-in or optional NeMo Guardrails judge) + ASI red-team checklist (OWASP ASI01–ASI10) + model card generation          |
| **AIVTF Checklist**     | AI Verify (IMDA) process checklist — tri-state scoring + PDF/Excel export                                                                                                            |
| **MCP Servers**         | MCP server registry + tool risk classification + invocation audit trail                                                                                                              |
| **Drift Monitoring**    | Benchmark + LLM-as-judge eval + quality scoring + degradation alerts                                                                                                                 |
| **Frontier Risk Tier**  | Frontier-AI systemic-risk tiering (Cyber / CBRN / Manipulation / Loss-of-control × Tier 1/2/3 thresholds) — versioned lifecycle + PDF/Excel                                          |
| **Transparency Report** | Versioned org/usecase transparency report — authored sections + auto-aggregated risk tiers, tier deltas, incidents, drift & posture; freeze-on-publish snapshot + PDF/Excel          |
| **MindForge Checklist** | MAS/ABS MindForge Gen-AI guardrails attestation checklist — tri-state scoring + lifecycle + PDF/Excel export                                                                         |
| **Agentic Governance**  | Agentic use-case governance checklist (7 original-wording domains AG1–AG7 × 4 = 28 items) — tri-state scoring + lifecycle + static cross-links to related modules + PDF/Excel export |
| **External Reports**    | Public vulnerability / usage-violation intake + triage queue with incident escalation                                                                                                |
| **Alignment Audit**     | Petri-style behavioral probes — inverted concern scoring (higher = worse), per-dimension rollup, readiness gate integration, manual incident escalation                              |
| **Usage Insights**      | Privacy-preserving usage themes from consented MCP invocations — PII scrub, embed/cluster, k-anonymity suppression, versioned draft/publish snapshots + PDF/Excel export             |
| **Trust Center**        | Publish a versioned public compliance summary and a token-gated confidential dossier at `/trust/<slug>`                                                                              |

Cross-cutting (not nav modules): the **Governance Posture** dashboard
(`/posture`, weighted controls/incidents/drift/budget score) with an org-wide
**go-live readiness rollup** tab; the **AI System Dossier** (system-centric
readiness page reached from an inventory item — aggregates checks, a go-live
review gate, and decision notification); and the **Audit Evidence Pack**
(deterministic, reproducible `.zip` export).

One more module ships its UI as a **card inside AI Trust** rather than a sidebar
entry: the **ASI Red-Team Checklist** (OWASP ASI01–ASI10 attestation), reached at
`/asi-redteam-checklist` from the AI Trust page. It has its own `module.config.ts`
but is intentionally not registered in the sidebar.

### Capability maturity

Not every module is equally mature. Rough guide (GA = solid/well-tested, Beta =
usable but newer, Experimental = thin or depends on an external sidecar):

| Maturity         | Modules                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GA**           | AI Inventory · Team Members · Risk & Regulations · Governance Maturity · Policies · Workflow · Evidence · Audit Log · Data Lineage · Integrations · AI Provider · Incidents · Compliance Reports · FinOps · MCP Servers |
| **Beta**         | AI Trust (red-team) · Drift Monitoring · AIVTF Checklist · MindForge Checklist · Vendors · SSO/OIDC self-service · Governance Posture · Audit Evidence Pack                                                             |
| **Experimental** | Frontier Risk Tier · Transparency Report · Agentic Governance Checklist · ASI Red-Team Checklist · AI System Dossier · Moonshot red-team engine (external sidecar) · NeMo Guardrails judge (external sidecar)           |

## Adding a new module

1. Create `src/app/[locale]/(dashboard)/(modules)/<slug>/`
2. Add `module.config.ts` exporting `defineModule({...})`
3. Append to `src/lib/modules/registry.ts`
4. Optional: add `prisma/modules/<slug>.prisma` for module-owned tables — `npm run prisma:migrate` will pick it up

## Architecture

- **Multi-tenant from day one**: every business table is org-scoped. `withOrg(prisma, orgId)` Prisma extension auto-injects `where: { orgId }` and rejects mismatches.
- **Module registry**: `src/lib/modules/registry.ts` is the single source of truth for installed modules; sidebar / permissions read from it.
- **Audit by default**: every mutation writes to `audit_log` via `writeAudit()` with sensitive-key scrubbing.
- **Event bus**: `usecaseEvents` singleton for cross-module communication (e.g. workflow → inventory promotion, workflow → webhook delivery).
- **Redteam abort flags**: defaults to in-memory; set `AIGP_ABORT_REDIS_REST_URL` + `AIGP_ABORT_REDIS_REST_TOKEN` to share abort state across replicas.
- **Background jobs**: heavy workloads (drift runs, incident pipeline, Moonshot red-team) go through a BullMQ queue served by a separate `worker` process; if `REDIS_URL` is unset they fall back to inline in-process execution.
- **Framework catalogs**: control/risk catalogs (FINOS AIGF, NIST AI RMF, ISO 42001, MITRE ATLAS, EU AI Act, MindForge, OWASP ASI) are seeded via idempotent importers and version-tracked in `FrameworkVersion`; re-import upserts, never deletes cross-source links. The Frontier Risk Tier and Transparency Report modules ship their own static catalogs and are deliberately **not** version-tracked.
- **i18n first**: `[locale]/...` route segment, `next-intl` provider, compliance terms stay in English.

## Security

- Content-Security-Policy headers on all routes (nonce-based, enforced via middleware)
- RBAC enforced server-side on every tRPC procedure
- API key authentication with SHA-256 hash and prefix reveal-once pattern
- Webhook signatures use HMAC-SHA256 with `X-AIGP-Signature` header

See [THREAT_MODEL.md](THREAT_MODEL.md) for trust boundaries, threats
considered per component, and explicitly accepted risk (rate limiting,
key rotation, SSRF on egress, audit-chain guarantees vs. DB-admin trust).

## Roadmap

| Milestone | Tag     | 内容                                                                                                                        |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| ✅ M0     | v0.1.0  | Foundation — auth / RBAC / i18n / module registry / audit / dashboard shell                                                 |
| ✅ M1     | v0.1.0  | Inventory + Risk + 6-pillar maturity assessment                                                                             |
| ✅ M2     | v0.1.0  | Policy engine + runtime LLM proxy + Playground                                                                              |
| ✅ M3     | v0.1.0  | Workflow + Evidence + Audit browser                                                                                         |
| ✅ M4     | v0.1.0  | Data Lineage + Integrations + cross-module dashboard                                                                        |
| ✅ M8     | v0.2.0  | Multi-tenant provider gateway (13 providers, AES-256-GCM at rest)                                                           |
| ✅ M9     | v0.3.0  | Compliance reports (NIST / ISO 42001 / ISO 27001 / EU AI Act)                                                               |
| ✅ M10    | v0.4.0  | FinOps — costs / budgets / pricing + reliability layer                                                                      |
| ✅ M11    | v0.5.0  | Enterprise connectors — Slack / Teams / ServiceNow bidirectional                                                            |
| ✅ M12    | v0.6.0  | AI Trust — redteam evaluation + model card generation                                                                       |
| ✅ M13    | v0.7.0  | FRIA + EU AI Act report template                                                                                            |
| ✅ M14    | v0.8.0  | Workflow notifications — inbox + bell + email stub                                                                          |
| ✅ M15    | v0.9.0  | Incident taxonomy upgrade — category + framework refs + SLA                                                                 |
| ✅ M16    | v0.10.0 | NL→policy generator — AI-native policy authoring                                                                            |
| ✅ M17    | v0.11.0 | Merkle audit (hash chain) — per-row SHA-256 + verifier                                                                      |
| ✅ M18    | v0.12.0 | MCP Trust Governance — server registry + tool risk + audit                                                                  |
| ✅ M19    | v0.13.0 | Drift Monitoring / LLM-as-judge — benchmarks + degradation alerts                                                           |
| ✅ M20    | v0.16.0 | Risk-assessment copilot — AI suggests risks + mitigations from catalog                                                      |
| ✅ M21    | v0.18.0 | Incident root-cause AI summarisation — structured RCA drafts + markdown accept                                              |
| ✅ M22    | v0.19.0 | SSO/OIDC — enterprise SSO alongside Credentials (JIT provisioning, account merge, audit)                                    |
| ✅ M23    | v0.20.0 | Intelligent incident pipeline — semantic dedup + policy-hit auto-classification                                             |
| ✅ M24    | v0.21.0 | Background job queue — BullMQ + Redis worker, inline fallback                                                               |
| ✅ M25    | v0.22.0 | Operability hardening — AuditSink AES-256-GCM encryption + BullMQ delivery queue + metrics                                  |
| ✅ M26    | v0.23.0 | 22→27 modules · 3→7 framework catalogs · enterprise hardening · Anthropic-alignment roadmap 9/9 (details below + CHANGELOG) |
| ✅ M27    | v0.24.0 | First public release (Apache-2.0) · Trust Center (module #28) · MCP tool-drift guard · production deploy hardening          |

**Shipped in v0.23.0:** MITRE ATLAS catalog · AI Verify Moonshot
red-team engine · framework version tracking · SSO self-service UI · NIST AI RMF

- ISO 42001 catalogs · governance posture dashboard · audit evidence pack · AIVTF
  process checklist · CI Postgres+Redis / no-Redis legs · EU AI Act catalog +
  report↔obligation wiring · MAS/ABS MindForge catalog + report template + Gen-AI
  guardrails checklist · agent-testing empty-state guidance (bilingual) · NeMo
  Guardrails integration (red-team judge + HITL/kill-switch Art.14 evidence) ·
  **OWASP + OpenAI FGF assessment items** — OWASP ASI catalog (7th framework
  source) · ASI red-team checklist (OWASP ASI01–ASI10) · **Frontier Risk Tier**
  module (4 systemic-risk categories × Tier 1/2/3) · **Transparency Report**
  module (versioned report + auto-aggregated risk/incident/drift/posture evidence)
  · **AI System Dossier** (system-centric readiness + go-live review gate) with
  org-wide **readiness rollup** tab, **go-live decision notification**, and
  redteam/drift **link-to-system** selectors · **Agentic Governance Checklist**
  (original-wording AG1–AG7 use-case governance) · Risk Copilot catalog-coverage
  fix (fair per-source token budget) · **evidenceRefs rendered in PDF + XLSX
  exports** across all four attestation checklists (Agentic / ASI / Frontier Risk
  Tier / MindForge).

**Enterprise & supply-chain hardening:** org hierarchy + policy
inheritance (HQ→child) · SSO/OIDC self-service + **SCIM 2.0** provisioning ·
Incident Trends module (embedding-cluster → LLM root-cause + worsening-trend
alerts) · Intelligent Incident Pipeline (semantic dedup + policy-hit
auto-classification) · **SSRF egress guard** · **encryption key rotation**
(`crypto:rotate-key`) · all dependabot majors incl. **Prisma 7** · **SBOM
(CycloneDX)** generation + CI dependency scan · **System Card** export (MD+PDF)
with Intended-Use / Prohibited-Uses section · `THREAT_MODEL.md`.

**Anthropic-alignment roadmap — ✅ complete (9/9):** RSP **capability→safeguard
binding** (readiness checks elevated advisory→blocking) + go-live
tier/model-fingerprint gate · **model/system deprecation lifecycle** (sunset
countdown + go-live hard-blocks) · **external/independent red-team attestation**
(org-reported PDF pinned by sha256) · **External Reports** (public
vulnerability/usage-violation intake + triage → incident escalation) ·
**Alignment Audit** (Petri-style behavioral probes, inverted concern scoring) ·
**Usage Insights** (Clio-style privacy-preserving usage themes — PII scrub,
k-anonymity suppression). See `docs/2026-07-07-anthropic-alignment-roadmap.md`.

测试基线：unit 1940/1940 · typecheck 0 errors.

## Setting up ServiceNow bidirectional sync (M11+)

### 1. Create a ServiceNow service account

Create a user in ServiceNow with at minimum the following roles:

- `itil` or `incident_manager`
- `web_service_admin` (REST API access)

Note the username + password (or generate a long random "API token" you'll use as the password).

### 2. Add a custom field on the `incident` table (one-time)

To round-trip our local Incident IDs, add a string column:

- **Column name**: `u_aigp_incident_id`
- **Type**: String, length 36
- **Display**: optional, can be hidden from forms

### 3. Create the integration in AIGP

1. **Integrations → Connectors → New Connector → ServiceNow**
2. Name: `prod-itsm` (or any label you prefer)
3. Instance URL: `https://acme.service-now.com`
4. Username / Password: from step 1
5. Subscribe to `incident.created` and `incident.statusChanged`
6. **Save** — a one-time inbound secret is shown. Copy it now; it cannot be retrieved later.

### 4. Create a Business Rule in ServiceNow

In ServiceNow Studio:

- Table: `incident`
- When: `after`
- Action: `Update`
- Filter conditions (optional): `u_aigp_incident_id is not empty`
- Advanced script:

  ```js
  var http = new sn_ws.RESTMessageV2();
  http.setEndpoint(
    "https://<your-aigp-host>/api/integrations/servicenow/inbound/<INTEGRATION_ID>",
  );
  http.setHttpMethod("POST");
  http.setRequestHeader("Content-Type", "application/json");
  http.setRequestHeader("X-Webhook-Secret", "<INBOUND_SECRET_FROM_STEP_3>");
  http.setRequestBody(
    JSON.stringify({
      sys_id: current.sys_id.toString(),
      number: current.number.toString(),
      state: current.state.toString(),
      short_description: current.short_description.toString(),
      u_aigp_incident_id: current.u_aigp_incident_id.toString(),
    }),
  );
  http.executeAsync();
  ```

Replace `<INTEGRATION_ID>` with the connector ID (visible in the URL of the detail page) and `<INBOUND_SECRET_FROM_STEP_3>` with the secret you copied.

### 5. Verify

- Click **Send test** on the connector — a new ServiceNow ticket should appear with category "AI / Policy violation".
- Change the ServiceNow ticket state — within seconds the linked AIGP incident's status updates. Open the **Sync log** section on the connector detail page to confirm both `outbound` and `inbound` rows are recorded.

### Echo loops are prevented

Every payload is canonicalized and hashed; if the inbound webhook delivers the exact same payload AIGP just sent (the typical echo a Business Rule produces immediately after an outbound POST), the inbound handler returns `action: skipped_echo` and writes a `skipped_echo` row to the sync log instead of looping.

## Acknowledgments

- The tamper-evident audit log design is adapted from the [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) (MIT-licensed), specifically ADR-0017 "Merkle chain for audit tamper evidence".
- The starter risk + mitigation catalog seeded into AIGP-Lite is derived from the [FINOS AI Governance Framework](https://github.com/finos/ai-governance-framework), licensed under **CC BY 4.0**. See `prisma/seeds/finos-aigf.json.LICENSE` for the full attribution and license text.
- The incident taxonomy categories, FRIA section structure, and EU AI Act report scope are adapted from the [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit), MIT-licensed.
- The adversarial threat catalog is derived from [MITRE ATLAS](https://atlas.mitre.org/) (©2021–2024 The MITRE Corporation; redistributed under its terms). See `prisma/seeds/*atlas*` LICENSE notes.
- The **NIST AI RMF 1.0** catalog reproduces subcategory codes from a U.S. Government public-domain work; all summaries are original wording.
- The **ISO/IEC 42001:2023** catalog is copyright-safe: it stores only Annex A control IDs, short control names, clause references, and **original** summaries — no ISO normative text is reproduced. See `prisma/seeds/iso-42001-catalog.json.LICENSE`.
- The **EU AI Act** catalog is derived from Regulation (EU) 2024/1689 (OJ L, 12.7.2024); see `prisma/seeds/eu-ai-act-catalog.LICENSE`.
- The **MindForge AI Risk Management** catalog and Gen-AI guardrails checklist are derived from the MAS/ABS "MindForge AI Risk Management" (Nov 2025, built on FEAT/Veritas) and the ABS "Handbook on Generative AI Guardrails in Banking" (May 2025); it stores only framework codes/titles and original-wording summaries. See `prisma/seeds/mindforge-catalog.LICENSE`.
- The optional red-team judge and HITL/kill-switch reference control are built on [NVIDIA NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) (Apache-2.0).
- The AIVTF process checklist is derived from Singapore IMDA's [AI Verify](https://aiverifyfoundation.sg/) testing framework.
- The **Agentic Use-Case Governance Checklist** catalog (domains AG1–AG7) is **original wording authored for AIGP**. It was informed at a directional level by industry commentary on agentic-AI governance but reproduces **no** third-party publication text and is not derived from any copyrighted source material. See `prisma/seeds/agentic-governance-catalog.json.LICENSE`.

## License

AIGP-Lite is licensed under the [Apache License 2.0](LICENSE). Third-party
catalogs and datasets keep their own terms; see [NOTICE](NOTICE) and the
`*.LICENSE` files next to each dataset.

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Report
security issues as described in [SECURITY.md](SECURITY.md).
