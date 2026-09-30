## v0.23.0 — 2026-07-09

The largest release to date: 22 → 27 sidebar modules, 3 → 7 framework catalogs,
and completion of the 9-item Anthropic-alignment roadmap. Unit suite 1469 → 1940.

### New modules

- **Incident Trends**: versioned incident-trend reports — embedding-cluster incidents → LLM root-cause themes, period-over-period deltas, and worsening-trend alerts fanned out to `incident-trends.write` holders on publish.
- **Frontier Risk Tier**: frontier-AI systemic-risk tiering (Cyber / CBRN / Manipulation / Loss-of-control × Tier 1/2/3) with versioned lifecycle + PDF/Excel export.
- **Transparency Report**: versioned org/usecase transparency report — authored sections + auto-aggregated risk tiers, incidents, drift & posture; freeze-on-publish snapshots.
- **MindForge Checklist**: MAS/ABS MindForge Gen-AI guardrails attestation checklist (tri-state scoring + lifecycle + PDF/Excel).
- **Agentic Governance**: original-wording agentic use-case governance checklist (AG1–AG7 × 4 = 28 items) with static cross-links to related modules.
- **AIVTF Checklist**: Singapore IMDA AI Verify process checklist (11/88/112 catalog, lifecycle, scoring, PDF/XLSX, en/zh).
- **Vendors**: third-party AI vendor inventory with contract terms, data-residency, and risk attributes, linked to usecases.
- **External Reports**: public (unauthenticated) vulnerability / usage-violation intake at `/r/<token>` + triage queue with incident escalation.
- **Alignment Audit**: Petri-style behavioral probe runs — inverted concern scoring (higher = worse), per-dimension rollup, readiness-gate integration.
- **Usage Insights**: Clio-style privacy-preserving usage themes from consented MCP invocations — PII scrub before embedding, k-anonymity suppression (default k=5), versioned draft/publish snapshots + PDF/Excel.

### Framework catalogs (3 → 7 sources)

- **NIST AI RMF 1.0** (72 controls, public-domain) and **ISO/IEC 42001 Annex A** (38 controls, copyright-safe original summaries) importers.
- **EU AI Act (Reg. 2024/1689)**: 12 risks + 15 obligations + 111 cross-links; EU AI Act report sections derive status live from ART-x obligation controls.
- **MAS/ABS MindForge** risk catalog + FEAT crosswalk.
- **OWASP Agentic Security Initiative** (ASI01–ASI10) + ASI red-team checklist (40 own-worded items) surfaced inside AI Trust.
- **MITRE ATLAS** (8 risks + 32 FINOS cross-links).
- Framework version tracking (`FrameworkVersion` table, `frameworks:status` script); all importers idempotent.

### Governance & readiness

- **AI System Dossier**: system-centric readiness page (12+ checks) with go-live review gate, org-wide readiness rollup tab on `/posture`, and go-live decision notifications.
- **RSP capability→safeguard binding**: `deriveEffectiveTier` + safeguard ladder elevates readiness checks from advisory to blocking by frontier tier; go-live approvals bound to tier + model fingerprint with `needs_re_review` staleness.
- **Model/system deprecation lifecycle**: deprecate/sunset fields, go-live hard-blocks, sunset countdown.
- **External red-team attestation**: org-reported attestation PDFs pinned by sha256; blocking readiness check for high-risk systems; System Card §5.
- **System Card export** (Markdown + PDF) incl. "Intended Use & Prohibited Uses" section; **Governance Posture** dashboard with weighted score; deterministic **Audit Evidence Pack** (.zip).
- **NeMo Guardrails** sidecar: red-team judge + HITL/kill-switch reference control captured as EU AI Act Art. 14 evidence.
- **Moonshot** red-team engine integration live-verified (datasets, toxicity, IMDA connectors, async sidecar adapter).

### Enterprise & security hardening

- **Org hierarchy + policy inheritance**: child orgs inherit HQ-enabled policies read-only.
- **SCIM 2.0 push provisioning** (Users v1) + **SSO/OIDC self-service UI** (DB-backed `SsoConnection`, encrypted client secret, JIT role-from-groups).
- **SSRF egress guard**: org-configured outbound destinations validated against private/internal ranges at save time and before every delivery (`AIGP_EGRESS_ALLOWLIST` escape hatch).
- **Encryption key rotation**: `pnpm crypto:rotate-key` idempotent re-encryption of all secrets at rest.
- **SBOM (CycloneDX)** generation + CI dependency-vulnerability scan; `THREAT_MODEL.md`.
- Org-isolation extension now covers all 55 orgId-carrying models, enforced by a schema-driven coverage test.
- All 9 dependabot major upgrades landed, including **Prisma 7** (driver-adapter architecture).

### Internal / CI

- CI matrix: Postgres+Redis leg and no-Redis (inline fallback) leg; dependency scan uploads the CycloneDX SBOM artifact.
- Risk Copilot catalog-coverage fix: fair per-source token budget replaces hard `slice(0,80)` truncation.
- Test-mode outbox (`/api/test/outbox`) recovers raw invite tokens for E2E.
- Full real-DB verification: all migrations apply cleanly to a fresh Postgres; unit suite 1940/1940.

## v0.22.0 — 2026-05-31

### Features

- **AuditSink secret encryption**: AuditSink `token`/`apiKey` columns replaced with an encrypted `secretsEncrypted` (AES-256-GCM) blob. Secrets are encrypted on write and stripped from all read responses. Existing sinks require re-entry of credentials.
- **Queue-based audit delivery**: Audit event delivery now runs via BullMQ (`audit.forward` job) with retry semantics instead of fire-and-forget.
- **Queue-based webhook delivery**: Webhook endpoint delivery now runs via BullMQ (`webhook.deliver` job) with retry semantics instead of fire-and-forget.
- **Expanded observability**: Metrics helpers moved to `src/lib/observability/metrics.ts` with `count`, `gauge`, `distribution`, and `timing` functions.
- **tRPC Sentry spans**: All tRPC procedures are now wrapped in Sentry spans (`op: "trpc"`) with org tagging and per-procedure error counting.
- **Business metrics**: `policy.evaluated`, `incident.opened`, `drift.run.{completed,degraded}`, `llm.invocation` + latency distribution now emitted.

### Bug Fixes

- Corrupt audit-sink secret blobs now degrade gracefully (treated as no credentials) instead of crashing the forward path.
- `webhook.deliver` job IDs now include a uniqueness suffix so distinct events for the same org do not dedupe against each other.
- Failed LLM invocations now emit metrics before the early-return guard, closing a silent metrics gap.

### Internal

- New job types: `audit.forward`, `webhook.deliver`.
- `forwardAuditLogToSinks()` extracted for BullMQ processor reuse.
- `sinkSecrets()` helper decrypts AuditSink secrets at forward time.

## v0.21.0 — 2026-05-31

### Added

- Background job queue (BullMQ + Redis). Drift runs and the incident pipeline
  (auto-open + dedup) now run on a supervised `aigp` queue consumed by a
  separate `worker` container, with bounded retries, deterministic job ids, and
  idempotent drift-run restart.

### Changed

- Drift `startRun`, policy-evaluation persistence, and incident creation enqueue
  jobs instead of launching unsupervised fire-and-forget promises. When
  `REDIS_URL` is unset they fall back to inline non-blocking execution
  (preserves dev/CI/test behavior).

## v0.20.0 — 2026-05-27

### Added

- Intelligent incident pipeline: semantic dedup (embedding-based merge suggestions) and policy-hit auto-classification (deterministic category/severity mapping, configurable triggers per org). See `docs/modules/incidents.md`.
