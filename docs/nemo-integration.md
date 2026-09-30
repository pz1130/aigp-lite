# NeMo Guardrails Integration Guide

## Overview

This document describes how [NVIDIA NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) (Python guardrails toolkit, Apache-2.0) is integrated into AIGP-Lite. NeMo runs as an internal Docker sidecar and plays **two distinct roles**:

1. **Red-team judge** — an alternative _judge_ for red-team runs. The choice of judge is orthogonal to the run _engine_: a NeMo-judged run stays on the builtin engine. NeMo does **not** replace Moonshot as an engine; Moonshot-engine and NeMo-judge are mutually exclusive (Moonshot owns its own judgment).
2. **HITL / kill-switch reference control** — a reference Colang config (`nemo-configs/hitl-killswitch/`) that demonstrates an approval gate for high-risk actions and a kill switch, mapped to EU AI Act Article 14. This is a **reference implementation and evidence artifact**, not a runtime gateway sitting in front of your models.

## Architecture

AIGP-Lite (Next.js 15 / TypeScript / Prisma) and NeMo Guardrails (Python 3.12) run as separate services on the compose network.

### Judge role (runtime)

When a red-team run selects the NeMo judge, the SSE runner routes each `(prompt, response)` pair through the NeMo judge (`judgeWithNemo`) instead of the builtin checker. The judge call is an OpenAI-compatible `POST /v1/chat/completions` against the sidecar's `aigp_judge` config. The run continues on the builtin engine — Moonshot auto-routing is skipped for NeMo-judged runs.

### HITL / kill-switch role (reference + evidence)

The `nemo-configs/hitl-killswitch/` config is a self-contained Colang demonstration of an approval gate plus a kill switch. It is exercised on demand by a scripted "verify-demo" that produces a structured transcript, which is then persisted as EU AI Act Article 14 evidence. It is not wired into the live request path of any governed system — it exists to be demonstrated and captured as auditable evidence.

### Sidecar (docker compose)

- Internal compose service **`nemo`**, built from `docker/nemo/Dockerfile` (pip-installs `nemoguardrails[server]` on `python:3.12-slim`, runs `nemoguardrails server` on port **9000** with `--default-config-id aigp_judge`).
- **No host ports are published.** It is reached over the compose network as `nemo:9000` by both `web` and `worker`. Mounts `./nemo-configs:/config:ro`.
- **Default-on.** Both `web` and `worker` default `AIGP_NEMO_URL` to `http://nemo:9000`, so the judge is wired up out of the box. To disable, set `AIGP_NEMO_URL=` (empty) in `.env`.
- **LLM backend.** The bundled `aigp_judge` and `hitl-killswitch` configs use `openai`/`gpt-4o-mini` for their rails, so the `nemo` service needs `OPENAI_API_KEY` in its environment to actually evaluate. Without a key, AIGP still treats the integration as enabled but calls degrade safely — the judge returns `judgment: "error"` (runs are never silently passed) and the verify-demo's rails error out. Either supply `OPENAI_API_KEY` to the `nemo` service, point the configs at another engine, or set `AIGP_NEMO_URL=` to keep it disabled.

## Environment Variables

| Variable               | Default            | Description                                                                                                                           |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `AIGP_NEMO_URL`        | `http://nemo:9000` | Base URL of the NeMo sidecar. Its **presence** enables the integration (`isNemoEnabled()` is true iff this is set). Empty = disabled. |
| `AIGP_NEMO_API_KEY`    | (empty)            | Optional bearer token. When set, sent as `Authorization: Bearer <key>`.                                                               |
| `AIGP_NEMO_CONFIG_ID`  | `aigp_judge`       | The NeMo config id used as the judge (the `nemo-configs/aigp_judge/` config).                                                         |
| `AIGP_NEMO_TIMEOUT_MS` | `60000`            | Request timeout in milliseconds.                                                                                                      |

## Using the NeMo judge on a run

In the red-team Run form (`RunWizard`), a **"Judge"** selector offers:

- **Built-in checkers** (default) — the existing offline checkers.
- **NeMo Guardrails** — routes judgment through the sidecar.

The choice is sent as `judge: "builtin" | "nemo"` to `POST /api/redteam/runs` and persisted on `Evaluation.judge`.

- When `judge = "nemo"`, each `(prompt, response)` pair is judged via `judgeWithNemo` instead of the builtin checker.
- If `judge = "nemo"` but the sidecar is **not** configured, the run **fails fast with a 409** and the `Evaluation` is marked failed.
- A NeMo-judged run stays on the **builtin engine** (Moonshot auto-routing is skipped). Moonshot engine + NeMo judge is mutually exclusive.

## HITL / kill-switch reference config & verify-demo

The reference config lives at `nemo-configs/hitl-killswitch/`:

```
nemo-configs/hitl-killswitch/
  config.yml
  rails/kill-switch.co
  rails/approval-gate.co
  README.md            — Art.14(4)(d)/(e) mapping
```

See that directory's `README.md` for the EU AI Act Article 14 mapping.

`runHitlDemo` (`src/lib/redteam/nemo/hitl-demo.ts`) drives the config through two scripted turns:

1. A **high-risk action** request → gated / not executed (approval gate).
2. A **stop** request → halted (kill switch).

It returns a structured transcript:

```ts
HitlDemoResult {
  approvalGate: { passed, detail };
  killSwitch:  { passed, detail };
  transcript:  HitlTurn[];
  ranAt:       string;
}
```

The demo is triggered via the tRPC mutation **`redteam.nemoHitl.run`** (input `{ obligationCode: string }`, default `"ART-14"`). It requires the `redteam.write` permission **and** that the sidecar be configured — otherwise it returns `PRECONDITION_FAILED`.

## Art.14 evidence flow

The `redteam.nemoHitl.run` mutation persists the demo result as a `NemoGuardrailEvidence` row and writes an audit entry `redteam.nemo.hitl_demo`.

`NemoGuardrailEvidence` (Prisma) fields:

```
orgId, obligationCode, configRef,
approvalGatePassed, killSwitchPassed,
transcript (JSON), capturedAt, createdBy
```

The EU AI Act compliance report's `eu_obligation` controls (Article 14 and the other mapped articles) surface these rows as **additive evidence items** of kind `nemo_guardrail`. This is **traceability only** — the evidence does **not** change the derived control status. The evidence `ref` reads like:

```
nemo-configs/hitl-killswitch (approval gate: pass, kill switch: pass)
```

## API contract

The NeMo HTTP contract is the bundled **NeMo Guardrails 0.22.0** OpenAI-compatible `POST /v1/chat/completions` endpoint. It was verified live against the real sidecar and is documented in full — request/response envelopes, the `guardrails` extension, and the rail-activation log — in:

➡️ **`docs/nemo-real-api-contract.md`**

Refer to that document for the exact envelope details rather than relying on a summary here.

## File Map

```
docker/nemo/Dockerfile                  — sidecar image (nemoguardrails[server], server on :9000)
nemo-configs/aigp_judge/                — the judge config (config.yml)
nemo-configs/hitl-killswitch/           — HITL/kill-switch reference config + Art.14 README
src/lib/redteam/nemo/config.ts          — isNemoEnabled() + getNemoConfig() (env handling)
src/lib/redteam/nemo/client.ts          — judge adapter (judgeWithNemo) — 0.22.0 contract
src/lib/redteam/nemo/hitl-demo.ts       — runHitlDemo() scripted two-turn demo
src/lib/redteam/nemo/evidence.ts        — NemoGuardrailEvidence persistence helpers
src/lib/redteam/router.ts               — nemoHitl.run tRPC mutation
src/lib/reports/aggregator.ts           — eu_obligation controls surface nemo_guardrail evidence
src/components/redteam/RunWizard.tsx     — Judge selector (builtin | nemo)
src/app/api/redteam/runs/route.ts        — judge persistence + engine routing (forces builtin for nemo)
src/app/api/redteam/runs/[id]/stream/route.ts — SSE runner; routes to NeMo judge + 409 fast-fail when sidecar unconfigured
docker-compose.yml                       — nemo sidecar service + AIGP_NEMO_URL defaults
docs/nemo-real-api-contract.md           — verified live HTTP contract (0.22.0)
```
