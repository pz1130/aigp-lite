# Anthropic-Alignment Feature Roadmap

**Date:** 2026-07-07
**Author:** governance-eng
**Status:** Sequenced backlog — each item enters its own brainstorm → spec → plan → build cycle when picked up.

## Purpose

A prior review compared this platform (AIGP-Lite, 24 governance modules) against
Anthropic's published governance practices — the Responsible Scaling Policy
(RSP/ASL), Usage Policy enforcement, model/system cards, external red-teaming,
alignment audits (Petri), and privacy-preserving usage insights (Clio). That
review produced **7 candidate new features** and **2 gaps in existing features**.

This document sequences all 9 in the user's requested order and, for each,
records: the goal, why it aligns with Anthropic practice, what existing
infrastructure it reuses, the open design questions that must be resolved in
brainstorming, a rough effort band, and its coupling to other items.

**This is a program roadmap, not 9 finished TDD plans.** Items 1, 5, 6, 7 and
gap 2 carry real design forks (data model, scoring semantics, privacy posture)
that must be settled with the user in a `superpowers:brainstorming` session
before a bite-sized plan can be written honestly. Items 3, 4 and gap 1 are
better-understood and could go almost straight to `writing-plans`. Each item
below names which path it takes.

### Effort bands

- **S** — 1 module surface, ≤~4 tasks, no schema migration or one additive column.
- **M** — new Prisma model(s) + router + UI + export wiring, ~6–10 tasks.
- **L** — new subsystem with scoring/aggregation semantics, external-facing
  surface, or cross-module data flow; needs decomposition, ~10+ tasks.

### Key coupling to flag up front

**Feature 1 (RSP capability-threshold → safeguard binding)** and **Gap 2
(go-live gate unaware of underlying model change)** are two halves of the same
idea: a use case's readiness/go-live approval should be _bound to the model and
capability tier it was approved against_, and should be _invalidated when the
model or its capability tier changes_. Build Feature 1 first (it defines the
capability-tier → required-safeguard mapping), then Gap 2 becomes "invalidate
the binding when the tier or model identity changes." They share the readiness
evaluator (`src/lib/dossier/readiness.ts`) and should be specced together even
though they ship as two increments.

---

## Feature 1 — RSP/ASL capability-threshold → safeguard binding

**Goal:** Let an org define capability thresholds (an ASL-style ladder) and bind
each threshold to a set of _required safeguards_; a use case at a given tier
cannot reach "ready/go-live" until its bound safeguards are satisfied.

**Anthropic alignment:** This is the core mechanic of the Responsible Scaling
Policy — capabilities are grouped into ASL tiers, and each tier triggers a
defined, escalating set of required safeguards (deployment + security). Today the
platform has a _static_ Frontier Risk Tier module (`src/lib/frontier-risk-tier/`,
`frt_*`, FGF categories × Tier 1/2/3) but the tier is descriptive only — it does
not _gate_ anything.

**Reuses:**

- `src/lib/frontier-risk-tier/` — the existing tier taxonomy is the natural home
  for the capability-threshold definitions (extend, don't duplicate).
- `src/lib/dossier/readiness.ts` — `evaluateReadiness(s)` with its `blockingIf`
  helper is exactly the gate to hook into. New checks become
  `blockingIf(tier requires safeguard X && safeguard X not satisfied)`.
- `src/lib/dossier/rollup.ts` — org-level readiness rollup already aggregates.

**Open design questions (brainstorm):**

1. Is the capability threshold **org-configurable** (admin defines the ladder) or
   a **fixed built-in ladder** (like FGF Tier 1/2/3) that use cases are mapped
   onto? Configurable is more faithful to "each lab writes its own RSP" but is
   materially more work (a rule-authoring UI).
2. What is a "safeguard" in the data model — does it reference existing controls
   (EU AI Act obligations, NIST/ISO controls already seeded) or a new
   `Safeguard` entity? Strong preference: **map to existing controls** so the
   binding reuses evidence already captured, rather than a parallel checklist.
3. Where does a use case's _current_ capability tier come from — manual
   classification, or derived from the existing `analyze/` LLM classification
   (`autonomyLevel` etc.)?

**Effort:** **L** (if org-configurable ladder) / **M** (if fixed ladder mapped to
existing controls). Recommend starting with the fixed-ladder-mapped-to-controls
scope and treating configurable authoring as a fast-follow.

**Path:** brainstorm → spec → plan. **Spec jointly with Gap 2.**

---

## Feature 2 — External jailbreak / vulnerability disclosure channel

**Goal:** A public-facing intake form + authenticated triage queue where external
researchers can report jailbreaks / safety vulnerabilities against a registered
AI system, feeding the existing incident pipeline.

**Anthropic alignment:** Anthropic runs a model-safety bug-bounty / responsible
disclosure program. The governance analogue is a structured intake that lands in
the org's incident taxonomy rather than an email inbox.

**Reuses:**

- `src/lib/incident*` / Intelligent Incident Pipeline (semantic dedup +
  policy-hit auto-classification) — a disclosure is an incident of a new source
  type; reuse dedup and classification wholesale.
- Existing public/unauthenticated route pattern (the SSO/accept-invite flows show
  how unauthenticated POST endpoints are structured and rate-limited).
- Notification fanout (`src/lib/notification/fanout.ts`) to alert triagers.

**Open design questions (brainstorm):**

1. **Abuse/egress surface.** A public intake is an unauthenticated write path —
   needs rate limiting, spam/captcha strategy, and payload-size caps. This is the
   highest-risk item on the list from a security standpoint. Must respect the
   existing SSRF egress guard posture (`AIGP_EGRESS_ALLOWLIST`).
2. Disclosure **confidentiality / embargo** state machine — reports often need a
   "received → triaging → fixed → published" lifecycle with a coordinated
   disclosure timer. How much of that ships in v1?
3. Per-system public identifier — do we expose a stable public token per
   registered system, or one org-wide intake with a system selector?

**Effort:** **M**, but with an outsized security-review component.

**Path:** brainstorm (security-forward) → spec → plan.

---

## Feature 3 — Usage Policy violation structured reporting

**Goal:** A structured intake + review workflow for reports that a deployed AI
system's _usage_ violated the org's acceptable-use / usage policy (distinct from
a technical vulnerability in Feature 2 — this is a policy/abuse report).

**Anthropic alignment:** Anthropic's Usage Policy enforcement pipeline —
structured reporting of prohibited-use violations, tied back to the policy clause
that was violated.

**Reuses:**

- The **NL→policy generator** (`project_nl_to_policy`) and the newly-shipped
  **Intended Use / Prohibited Uses** system-card fields (`intendedUseMd` /
  `prohibitedUseMd` on `AiUsecase`) give the _policy text_ a violation is scored
  against. A report can cite the specific prohibited-use clause.
- Incident taxonomy + workflow-notifications for routing and SLA.

**Open design questions (brainstorm):**

1. Relationship to Feature 2 — same intake with a `type` discriminator, or a
   separate module? Recommend **one "external reports" module with a type enum**
   (`vulnerability` | `usage_violation`) to avoid two near-identical intakes.
   This means Features 2 and 3 should likely be **specced together and Feature 3
   becomes the second report type**, not a wholly separate build.
2. Does a confirmed usage violation auto-open an incident, or stay in its own
   register until an admin escalates?

**Effort:** **S–M** if built as the second report type on Feature 2's module;
**M** standalone.

**Path:** fold into Feature 2's brainstorm; then plan.

---

## Feature 4 — Model/system deprecation lifecycle workflow

**Goal:** A first-class "deprecation" lifecycle stage with a workflow: mark a
system deprecated, set a sunset date, notify stakeholders, and enforce
downstream consequences (e.g. block new use cases from binding to it).

**Anthropic alignment:** Anthropic publishes model deprecation & retirement
practices (advance notice, migration windows). Governance analogue is a tracked
deprecation state with notifications and a sunset clock.

**Reuses:**

- **Confirmed grounding:** `prisma/modules/inventory.prisma` `enum
LifecycleStage` today is `{ proposed, development, production, retired }` —
  there is **no `deprecated` value**. This feature adds `deprecated` between
  `production` and `retired`.
- Workflow-notifications (inbox + email + event bus) for the sunset-notice fanout
  — mirror the go-live decision notification pattern (`project_go_live_decision_notification`).
- Incident-trend / posture surfaces that already read `lifecycleStage`.

**Open design questions (brainstorm):**

1. What does `deprecated` _enforce_? Options: soft (badge + notice only), or hard
   (block new dossier links / new go-live approvals against a deprecated system).
2. Sunset-date reminders — reuse BullMQ scheduled jobs (the queue already exists)
   for "30 days to sunset" notices?

**Effort:** **S–M**. This is the most self-contained, lowest-risk item — a good
candidate to ship early for momentum. Adding the enum value ripples into any
exhaustive `switch` on `LifecycleStage`; the plan must enumerate those call
sites.

**Path:** short brainstorm (mainly Q1) → plan.

---

## Feature 5 — External / independent red-team attestation

**Goal:** Capture that a red-team run was performed by an _independent external
party_, with an attestation record (who, scope, date, signed statement / evidence
link) surfaced on the system card and dossier.

**Anthropic alignment:** Anthropic uses external/independent red-teaming and
third-party evaluations; the governance value is a verifiable attestation, not
just an internal run.

**Reuses:**

- `src/lib/redteam/` — the run model already has `externalRunId String?`
  (confirmed in `prisma/modules/redteam.prisma`). Extend with attester identity +
  attestation artifact rather than a new subsystem.
- System-card export (`src/lib/system-card/`) — add an attestation line to the
  Evaluations/Red-team section (same renderer pattern just used for Intended Use).
- Readiness check: an external-attestation check can become
  `blockingIf(isHighRisk)` in `readiness.ts`, parallel to the existing redteam
  check.

**Open design questions (brainstorm):**

1. **Trust model.** How is "independent" _verified_ vs. merely _asserted_? v1 is
   almost certainly self-attested (org records the external party + uploads a
   signed PDF). Cryptographic attestation (signature verification) is a large
   fast-follow — flag but likely out of v1 scope.
2. Artifact storage — reuse the existing evidence-pack / AuditSink encrypted
   storage, or a link-only field?

**Effort:** **M**.

**Path:** brainstorm (trust model) → spec → plan.

---

## Feature 6 — Petri-style alignment audit

**Goal:** A structured alignment-audit module: run a battery of behavioral probes
(deception, sycophancy, power-seeking, eval-awareness, etc.) against a system and
record scored results as governance evidence.

**Anthropic alignment:** Petri (Anthropic's parallel-investigation alignment
auditing agent) — automated behavioral auditing across many probe scenarios.

**Reuses:**

- **Drift monitoring** (`src/lib/drift/`, LLM-as-judge) is the closest existing
  machinery — an alignment audit is structurally "run probes → judge outputs →
  score → alert on threshold." Strong candidate to build as a _sibling_ of drift
  using the same judge harness rather than greenfield.
- NeMo Guardrails integration already wired as a red-team judge — the alignment
  probes could reuse that judge path.

**Open design questions (brainstorm) — this is the least-defined item:**

1. **Where do probe scenarios come from?** Author a starter catalog of alignment
   dimensions (own-worded, copyright-safe, as done for OWASP/Gartner catalogs), or
   integrate an external suite? Catalog-authoring is the bulk of the work.
2. **Scoring semantics** — per-dimension pass/fail, a composite alignment score,
   or trend-over-time? This drives the whole data model.
3. Relationship to the existing Frontier Risk Tier and to Feature 1's capability
   thresholds — does a failed alignment audit _raise_ the required-safeguard tier?

**Effort:** **L**. Needs decomposition; the probe catalog alone is a sub-project.

**Path:** dedicated brainstorm → likely decompose into (a) probe catalog + (b)
run/scoring engine → separate specs.

---

## Feature 7 — Clio-style usage insights

**Goal:** Privacy-preserving aggregate insight into how deployed AI systems are
actually being used — clustered themes over usage/interaction data, surfaced
without exposing individual records.

**Anthropic alignment:** Clio — privacy-preserving analysis of aggregated usage
patterns via bottom-up clustering.

**Reuses:**

- The **Incident Trends** module (`itr_report` / `itr_cluster`) already does
  _exactly_ the core technique: **embedding-based clustering → LLM root-cause
  summarization** over incident text. Feature 7 is that same pipeline pointed at
  usage/interaction data instead of incidents. This is the strongest reuse on the
  whole list — Feature 7 should be modeled directly on the Incident Trends
  architecture.

**Open design questions (brainstorm) — privacy is the crux:**

1. **What is the input corpus, and where does it come from?** The platform does
   not today ingest raw model interaction logs. This feature needs a defined,
   consented data source. This is a first-order product decision, not a detail.
2. **Privacy guarantees** — minimum cluster size / k-anonymity thresholds,
   PII scrubbing before embedding, aggregation-only exposure. Must be specified
   before any implementation; this is the item most likely to be _descoped to a
   design spike_ rather than built immediately.

**Effort:** **L**, gated on the data-source decision. Realistically the lowest
build-priority of the 7 despite high conceptual value, because it depends on a
data source that does not yet exist.

**Path:** brainstorm as a **design spike first** (data source + privacy model)
before committing to build.

---

## Gap 1 — Transparency Report: no org-level aggregation

**Current state:** The Transparency Report module (`src/lib/transparency-report/`,
`txr_*`) produces a report for a **single system** — authored sections +
auto-aggregation, freeze-on-publish. There is no way to roll multiple systems'
transparency data into one org-level report.

**Goal:** An org-level transparency report that aggregates across all (or a
selected set of) systems — counts, risk-tier distribution, incident/eval
summaries — analogous to a lab-wide transparency report.

**Reuses:**

- `src/lib/dossier/rollup.ts` (`buildReadinessRollup`) is the established
  org-level aggregation pattern (it powers the Posture rollup tab). The org-level
  transparency report is "the same rollup shape, over transparency-report data."
- Existing `txr_*` per-system aggregation logic — the org report aggregates the
  aggregates.

**Open design questions (brainstorm — light):**

1. Fixed org-wide scope vs. a selectable system set (portfolio)?
2. Freeze-on-publish semantics at org level — does publishing the org report
   freeze it independently of the per-system reports it summarizes?

**Effort:** **M**. Well-understood — closest to ready-to-plan of the design-fork
items because both the aggregation pattern (`rollup.ts`) and the per-system module
already exist.

**Path:** short brainstorm → spec → plan.

---

## Gap 2 — Go-live gate unaware of underlying model change

**Current state:** `readiness.ts` gates go-live on completed checks, but a
go-live approval is **not bound to the specific model/version it was approved
against**. If the underlying model is swapped or upgraded after approval, the
"live" status silently persists — the readiness state has no model-identity input
(`readiness.ts:169` flips to `"live"` purely on `goLive.status`).

**Goal:** Bind a go-live approval to a model/capability fingerprint; when the
underlying model identity or its capability tier changes, invalidate the approval
(revert to "needs re-review") and notify owners.

**Anthropic alignment:** RSP requires re-evaluation when capabilities cross
thresholds — an approval is not permanent across model changes.

**Reuses:**

- **Feature 1's capability-tier mapping is the trigger source** — this is the
  second half of the Feature 1 coupling flagged at the top. Gap 2 = "when the
  bound tier or model identity changes, invalidate."
- `readiness.ts` `evaluateReadiness` + `goLive` state; go-live decision
  notification pattern for the "your approval was invalidated" fanout.

**Open design questions (resolve with Feature 1's brainstorm):**

1. What constitutes the "model fingerprint" that, when changed, invalidates —
   a free-text model version field, `modelCardMd` hash, or a structured
   model-identity record? The platform has no structured model-identity entity
   today; this may need one (and that entity is also useful to Feature 4 and 5).
2. Invalidate immediately (hard revert to not-ready) vs. flag-for-review (soft)?

**Effort:** **M**, but **do not build before Feature 1** — it depends on the
tier-binding Feature 1 introduces.

**Path:** spec **jointly with Feature 1**; build as the increment after it.

---

## Recommended build sequence (with coupling respected)

The user's listed order is preserved as the default. Two coupling-driven notes:

1. **Features 2 + 3 are one module** (external reports with a type enum) — spec
   together, ship Feature 2's channel first, then Feature 3's second report type.
2. **Feature 1 + Gap 2 are one design** (capability-tier binding, then
   invalidate-on-change) — spec together, ship Feature 1 first, Gap 2 as the next
   increment.

Suggested momentum ordering **within** the user's list, if flexibility is
allowed: **Feature 4 (deprecation)** and **Gap 1 (org transparency rollup)** are
the lowest-risk, best-understood, highest-reuse items — good early wins — while
**Feature 6 (alignment audit)** and **Feature 7 (Clio-style)** are the two that
need design spikes before any code. If strict list order is required, that is
fine; items 6 and 7 will simply spend longer in brainstorming.

## Next step

Pick the first item to build. Each item then runs the standard pipeline:
`superpowers:brainstorming` (design spike where flagged) → spec in
`docs/superpowers/specs/` → `superpowers:writing-plans` → `subagent-driven-development`.
