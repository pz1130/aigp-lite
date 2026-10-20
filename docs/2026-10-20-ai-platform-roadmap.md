# AI Platform Follow-up Roadmap

**Date:** 2026-10-20
**Status:** Backlog. Nothing here is scheduled yet. Each item goes through its own design → plan → build cycle when it is picked up.

## Purpose

PR [#11](https://github.com/pz1130/aigp-lite/pull/11) moved AI features onto org
provider connections. It also added native structured outputs, richer provider
adapters (tools, images, detailed usage, `runToolLoop`), MCP SDK drift polling and
login rate limiting. This document records two groups of work:

- **Part A**: loose ends left open by that PR.
- **Part B**: further improvements found in the same review, based on recent
  changes in the LLM, MCP and Next.js ecosystems.

Priorities are a suggested order, not deadlines.

### Priority legend

- **P0**: Do next. It closes a governance or safety gap in shipped code.
- **P1**: High value. Build it once P0 is done.
- **P2**: Worthwhile, but not urgent.
- **P3**: Opportunistic. Build it when the area is touched anyway.

### Effort bands

- **S**: One module surface, ≤~4 tasks, no migration or one additive column.
- **M**: New model(s), router and UI wiring, ~6–10 tasks.
- **L**: A new subsystem, or cross-module data flow that needs decomposition, ~10+ tasks.

## Summary

| #   | Item                                                    | Part | Priority | Effort |
| --- | ------------------------------------------------------- | ---- | -------- | ------ |
| A4  | Policy-evaluate tool-call args/results in the gateway   | A    | P0       | M      |
| B8  | MCP gateway for `tools/call`                            | B    | P0       | L      |
| A1  | Live verification of structured outputs and tool calls  | A    | P1       | S      |
| A5  | Org-level AI feature switch                             | A    | P1       | S      |
| A3  | First real consumer of `runToolLoop`                    | A    | P1       | M      |
| B5  | Prompt caching / retrieval for the Risk Copilot catalog | B    | P1       | M      |
| B7  | OpenTelemetry GenAI tracing                             | B    | P1       | M      |
| A2  | Drift polling for OAuth-protected MCP servers           | A    | P2       | M      |
| B6  | pgvector for embeddings                                 | B    | P2       | M      |
| B9  | Expose AIGP as an MCP server                            | B    | P2       | L      |
| B10 | Auth: leave the next-auth beta; add passkeys            | B    | P2       | M      |
| B13 | AI-BOM export (CycloneDX ML-BOM / SPDX 3.0 AI)          | B    | P2       | M      |
| B12 | New framework catalogs                                  | B    | P2       | M      |
| B14 | EU AI Act milestones as configurable data               | B    | P3       | S      |
| B11 | Frontend modernisation                                  | B    | P3       | M      |

Suggested start: **A4**, then **B8**. They share the same evaluation path:
tool-call governance in the runtime proxy is the foundation the MCP gateway
builds on.

---

## Part A: Loose ends from PR #11

### A1. Live verification of structured outputs and tool calls (P1 · S)

**Gap:** The native structured outputs are only covered by mocked tests. These are
`response_format` for OpenAI/Azure, `output_config.format` for Anthropic and
`responseJsonSchema` for Gemini. The same is true of the tool-call request and
streaming shapes.

**Do:**

- Add an opt-in live-test suite, e.g. `*.live.test.ts`, gated on provider API key
  env vars and skipped by default in CI.
- Run one structured-output request and one tool round-trip per provider.
- Optionally add a manual or scheduled CI workflow that runs the suite with repo
  secrets.

**Done when:** Each of the three providers passes a live structured-output and
tool-call round-trip. Any schema subset the provider rejects is documented.

### A2. Drift polling for OAuth-protected MCP servers (P2 · M)

**Gap:** The MCP tool-drift sweep skips servers that need OAuth. Those servers
get no rug-pull protection.

**Do:**

- Store per-server OAuth client credentials or refresh tokens encrypted, like
  other secrets.
- Use the MCP SDK's OAuth client provider.
- Keep every request routed through the egress guard.

**Done when:** OAuth servers are polled and baselined like the others. A
token-refresh failure shows up as a degraded poll, not a silent skip.

### A3. First real consumer of `runToolLoop` (P1 · M)

**Gap:** `src/lib/runtime/providers/tool-loop.ts` is implemented and tested, but no
feature uses it yet.

**Do:**

- Pick one feature where tools add real value, e.g. Risk Copilot looking up
  catalog entries or inventory records on demand instead of preloading them.
- Define read-only, org-scoped tools.
- Cap the turn count and total tokens.
- Record per-turn usage.

**Done when:** One feature ships on `runToolLoop`, with tests for the tool
handlers and the turn and usage limits. This depends on A4 if any tool can reach
outside the org's own data.

### A4. Policy-evaluate tool-call args and results in the gateway (P0 · M)

**Gap:** The runtime proxy (`src/lib/runtime/proxy.ts`) evaluates policies on
prompt and completion text. It does not evaluate tool-call arguments emitted by
the model, or tool results sent back in. Now that the adapters carry tools, this
is an unguarded channel: PII, secrets or prohibited actions can pass through
tool arguments.

**Do:**

- Extend the policy evaluation input with tool name, arguments and result content.
- Add rule targets for them, e.g. `tool_name`, `tool_args` and `tool_result`.
- Apply the existing block, redact and flag actions.
- Record the outcome in the audit chain.

**Done when:** A policy can block or redact a tool call by name or argument
content, in both streaming and non-streaming paths, with tests.

### A5. Org-level AI feature switch (P1 · S)

**Gap:** AI features turn on automatically as soon as an org has an active
`ProviderConnection` with a resolvable model. No org setting can turn them off,
either globally or per feature.

**Do:**

- Add an org setting, with an optional per-feature override, that disables AI
  features even when a connection exists.
- Respect it in the feature gating helpers and in the UI.

**Also note:** The Anthropic default model changed to `claude-sonnet-4-6` in
PR #11. Mention it in upgrade notes for orgs that relied on the old default.

**Done when:** An admin can disable AI features per org. Disabled features show a
clear state instead of erroring.

---

## Part B: Further improvements

### B5. Prompt caching / retrieval for the Risk Copilot catalog (P1 · M)

**Now:** Risk Copilot sends up to ~40k tokens of catalog context on every request
(`RISK_COPILOT_CATALOG_TOKEN_BUDGET`).

**Do:**

- **Quick win:** Mark the stable catalog prefix as cacheable. Use Anthropic
  `cache_control` and rely on automatic prefix caching for OpenAI and Gemini.
  The adapters already report cache-read and cache-write tokens, so the effect
  can be measured.
- **Longer term:** Retrieve only the relevant catalog entries by embedding
  similarity. This combines well with B6.

**Done when:** Cache hit rate and cost savings are visible in usage records, or
retrieval cuts prompt size with no drop in suggestion quality on a fixed eval set.

### B6. pgvector for embeddings (P2 · M)

**Now:** Embeddings are stored as JSON arrays. See `prisma/modules/incidents.prisma`
and `prisma/modules/external-reports.prisma`. Similarity is computed in app code
(`src/lib/incidents/dedup.ts`).

**Do:**

- Enable the `vector` extension.
- Add a `vector(n)` column with an HNSW index.
- Record `embeddingModel` and the dimension per row so model changes are safe.
- Backfill existing rows.
- Move nearest-neighbour search into SQL.

**Done when:** Dedup and clustering run as indexed queries. Mixed-model rows are
never compared.

### B7. OpenTelemetry GenAI tracing (P1 · M)

**Do:**

- Instrument the runtime proxy and the AI features with the OpenTelemetry GenAI
  semantic conventions (`gen_ai.*` attributes for model, tokens and finish reason).
- Propagate trace context through BullMQ jobs.
- Export over OTLP, so Langfuse, Phoenix or any OTel backend can be used.
- Link spans to audit-chain entries by ID.

**Done when:** One trace covers request → policy evaluation → provider call →
async job. It carries GenAI attributes and audit references.

### B8. MCP gateway for `tools/call` (P0 · L)

**Now:** AIGP registers MCP servers and their tools, scores tool risk and detects
drift. It does not sit in the path of actual `tools/call` traffic.

**Do:**

- Build a proxying MCP gateway with:
  - a per-org and per-agent tool allowlist;
  - risk tiers driving the allow / require-approval / deny decision;
  - human-in-the-loop approval for high-risk calls, reusing the workflow and
    notifications;
  - policy-engine checks on arguments and results, reusing A4;
  - automatic `McpToolInvocation` records and audit-chain entries.
- Calls to a tool whose definition drifted from its approved baseline are blocked.

**Done when:** An agent can point at the gateway instead of the upstream server.
Every call is governed and auditable.

### B9. Expose AIGP as an MCP server (P2 · L)

**Do:**

- Publish an MCP server with org-scoped, RBAC-enforced tools and resources:
  inventory lookup, incident create/search, control status and assessment status.
- Make the tools read-mostly, and route writes through the existing tRPC
  permission checks.

**Done when:** An MCP client, such as an IDE assistant or agent, can query the
governance inventory and open incidents with a scoped token.

### B10. Auth: leave the next-auth beta; add passkeys (P2 · M)

**Now:** Auth depends on `next-auth@5.0.0-beta.31`.

**Do:**

- Either pin it exactly and track upstream, or evaluate a migration to a stable
  library such as Better Auth. Account for SSO/OIDC, SCIM, credential login and
  the rate limiter.
- Add passkeys (WebAuthn) as a sign-in method.

**Done when:** Auth runs on a non-beta dependency, or a deliberate pin has a
documented upgrade path. Users can register and sign in with a passkey.

### B11. Frontend modernisation (P3 · M)

**Do:**

- Turn on `typedRoutes`, which is currently `false` in `next.config.ts`, and fix
  the reported route errors.
- Try Cache Components (`use cache`) on read-heavy dashboards.
- Trial the React Compiler on one module.
- Migrate `reactflow` 11 to `@xyflow/react` 12.

**Done when:** Each step lands on its own, with build, lint, unit and E2E tests
green.

### B12. New framework catalogs (P2 · M)

**Candidates:**

- NIST AI 600-1 (Generative AI Profile).
- ISO/IEC 42005 (AI system impact assessment).
- ISO/IEC 42006 (requirements for bodies auditing AI management systems).
- The EU General-Purpose AI Code of Practice.

**Do:** Follow the existing importer pattern: idempotent imports with
`FrameworkVersion` tracking and cross-links. Use original-wording summaries
wherever the source text is copyrighted.

**Done when:** Each catalog imports idempotently and is cross-linked to the
existing controls. Its licence is recorded in `NOTICE`.

### B13. AI-BOM export (P2 · M)

**Do:** Export an AI bill of materials for each AI system. Cover models, datasets,
providers and MCP tools, in CycloneDX ML-BOM and/or SPDX 3.0 AI profile format.
Build it from inventory, dossier and provider-connection data. Add it to the
Audit Evidence Pack.

**Done when:** The export validates against the format's schema and appears in
the evidence pack.

### B14. EU AI Act milestones as configurable data (P3 · S)

**Do:** Store EU AI Act application milestones as seed data that admins can edit,
not as hard-coded dates. Report sections and countdowns read from that data. Do
not assert specific dates in code: timelines can change through later EU
legislation.

**Done when:** Updating a milestone needs a data change only, with no code change.
