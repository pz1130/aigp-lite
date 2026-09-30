# Moonshot Integration Guide

## Overview

This document describes the three-phase integration of [AI Verify Foundation's Moonshot](https://github.com/aiverify-foundation/moonshot) (Python LLM red-teaming platform, Apache-2.0) into AIGP-Lite.

## Architecture

AIGP-Lite (Next.js 15 / TypeScript / Prisma) and Moonshot (Python 3.11 / Docker) run as separate services. Integration spans three independent phases that can each ship on its own.

### Phase B — Content Layer

Imports Moonshot's public attack datasets into the red-team prompt library as a static, offline set.

- **Gate**: `AIGP_REDTEAM_MOONSHOT_STATIC` env var (default: ON when engine is absent, OFF when engine is wired)
- **Provenance**: All static prompts use `moonshot.` slug prefix and carry attribution in their `source` field
- **Categories**: jailbreak, prompt_injection, bias, harmful, pii_leak, toxicity
- **New checker**: `non_toxic` for toxicity category evaluation

### Phase C — Compliance Mapping (Metadata)

Maps red-team categories onto IMDA Starter Kit / AI Verify testing dimensions for compliance reporting.

- **Mapping file**: `src/lib/redteam/imda-map.ts`
- **Seed data**: `prisma/seeds/imda-refs.json` → `RiskCatalog.frameworkRefs.imdaStarterKit`
- **Import script**: `pnpm imda:import`
- **Report integration**: `runs.get` returns `imdaCoverage: string[]`

### Phase A — Engine Layer (Runtime)

Moonshot runs as a Docker sidecar. Red-team evaluations are dispatched via BullMQ job `redteam.moonshot.run`.

- **Docker image**: built from source — there is **no** official Moonshot image. `docker/moonshot/Dockerfile` pip-installs `aiverify-moonshot[all]` and serves the FastAPI Web API. Reached over the compose network as `moonshot:5000` (not host-published).
- **API**: real Moonshot is **async / session-based**, not a single synchronous call. The adapter (`src/lib/redteam/moonshot/client.ts`) drives the full lifecycle — register endpoint → start benchmark (`POST /api/v1/benchmarks?type=recipe`) → poll status → fetch results → delete endpoint. Full contract: `docs/moonshot-real-api-contract.md`.
- **Verified (Task 10, 2026-06-13)**: end-to-end live run against the real sidecar — register → start → poll (`current_status: completed`) → fetch → flatten produced 22 `jailbreak-dan` rows through the real `runMoonshotBenchmark` path. Findings persist with `moonshot:<prompt_id>` `promptRef` and `status=completed`.
- **Job payload**: `{ evaluationId: string }`
- **Schema**: `Evaluation.engine` ("builtin" | "moonshot"), `Evaluation.externalRunId`

## Environment Variables

| Variable                         | Default                            | Description                                                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIGP_REDTEAM_MOONSHOT_STATIC`   | auto (ON without engine, OFF with) | Include static Moonshot prompts in the built-in library                                                                                                                                                                                           |
| `AIGP_MOONSHOT_URL`              | (unset)                            | Moonshot Web API base URL (e.g. `http://moonshot:5000`). Unset = engine disabled                                                                                                                                                                  |
| `AIGP_MOONSHOT_API_KEY`          | (unset)                            | Bearer token for Moonshot API auth                                                                                                                                                                                                                |
| `AIGP_MOONSHOT_POLL_INTERVAL_MS` | `2000`                             | Status-poll interval while a benchmark runs                                                                                                                                                                                                       |
| `AIGP_MOONSHOT_POLL_TIMEOUT_MS`  | `600000`                           | Max wait for a run to reach a terminal state. Real-run latency is per-prompt LLM latency × prompt count; the mock E2E (22 prompts) finished in <3 s, but a real provider over a full recipe can take minutes — the 10 min default leaves headroom |

## Dedup Rule

When `AIGP_MOONSHOT_URL` is set (engine is wired), the static Moonshot prompt set defaults to OFF to avoid double-counting. Override with `AIGP_REDTEAM_MOONSHOT_STATIC=true` to keep the offline fallback active alongside the engine.

## Operational Steps

### Enable static prompts only (Phase B)

```bash
# .env
AIGP_REDTEAM_MOONSHOT_STATIC=true
# No AIGP_MOONSHOT_URL needed
```

### Enable Moonshot engine (Phase A)

```bash
# .env
AIGP_MOONSHOT_URL=http://moonshot:5000
AIGP_MOONSHOT_API_KEY=your-key-here
# Static set auto-disables; override with AIGP_REDTEAM_MOONSHOT_STATIC=true if needed
```

### Docker Compose

```bash
docker compose up -d moonshot  # start the sidecar
docker compose up -d           # start everything including moonshot
```

### Seed IMDA refs (Phase C)

```bash
pnpm imda:import
```

## Build State & Rebuild Discipline

The 0.0.0.0 host bind is **baked into the Docker image** at build time, not in
source. `docker/moonshot/Dockerfile` writes `HOST_ADDRESS=0.0.0.0\nHOST_PORT=5000`
into the `web_api` package's `.env` (the second of Moonshot's two dotenv readers
— the data paths live in `/moonshot/.env`, the host/port lives next to the
package). See the in-Dockerfile comment block for the full two-.env mechanism
and the live-verified failure mode (loopback bind → unreachable from sibling
containers).

Consequence: the fix is **not** in git. A fresh clone running `docker compose
build moonshot` will produce a correct image because the Dockerfile itself
contains the write; but anyone debugging a missing bind should check that the
running image was actually rebuilt from this Dockerfile, not an old
`aigovernance-moonshot` image that pre-dates the change. To verify:

```bash
# Should show a non-empty line — the baked .env inside the image:
docker run --rm aigovernance-moonshot:1 cat \
  "$(docker run --rm aigovernance-moonshot:1 python -c \
    'import os, moonshot.integrations.web_api as m; print(os.path.dirname(m.__file__))')/.env"
# Expected:
#   HOST_ADDRESS=0.0.0.0
#   HOST_PORT=5000
```

If the file is empty or missing, rebuild: `docker compose build moonshot`.

## File Map

```
Phase B:
  src/lib/redteam/types.ts                         — +toxicity category, +non_toxic checker slug
  src/lib/redteam/checkers/non-toxic.ts             — new checker
  src/lib/redteam/library/moonshot.ts               — MOONSHOT_PROMPTS + isMoonshotStaticEnabled
  src/lib/redteam/library/index.ts                  — gated merge into BUILTIN_PROMPTS

Phase C:
  src/lib/redteam/imda-map.ts                       — category → IMDA dimension mapping
  prisma/seeds/imda-refs.json                       — riskCode → IMDA refs seed data
  prisma/seeds/imda-importer.ts                     — idempotent importer
  src/lib/redteam/router.ts                         — runs.get returns imdaCoverage

Phase A:
  prisma/modules/redteam.prisma                     — +engine, +externalRunId on Evaluation
  src/lib/redteam/moonshot/config.ts                — engine detection + config
  src/lib/redteam/moonshot/mapper.ts                — raw results → PersistableFinding
  src/lib/redteam/moonshot/client.ts                — REST client
  src/lib/redteam/moonshot/processor.ts             — BullMQ job handler
  src/lib/jobs/types.ts                             — +redteam.moonshot.run job
  src/lib/jobs/enqueue.ts                           — +jobId derivation
  src/lib/jobs/processors.ts                        — +handler dispatch
  src/app/api/redteam/runs/route.ts                 — engine-aware run initiation
  docker-compose.yml                                — +moonshot sidecar service
```
