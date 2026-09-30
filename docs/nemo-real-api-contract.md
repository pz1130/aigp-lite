# NeMo Guardrails Server API — Real Contract (Task 8 deliverable)

**Date:** 2026-06-19
**Installed version:** `nemoguardrails 0.22.0` (from `docker/nemo/Dockerfile`,
`pip install "nemoguardrails[server]"`).
**Source of truth:** the live sidecar's `/openapi.json` + a live `POST
/v1/chat/completions` round-trip, both run from a throwaway container on the
compose network (`docker run --rm --network aigovernance_default curlimages/curl
... http://nemo:9000/...`). The sidecar is internal-only — no host port is
published.

This file is the contract the judge adapter (`src/lib/redteam/nemo/client.ts`)
is reconciled to.

---

## What was verified LIVE vs. against the schema/source

| Aspect                                                                | How verified                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Server boots and binds `0.0.0.0:9000`                                 | **LIVE** — uvicorn log `Uvicorn running on http://0.0.0.0:9000`.                                              |
| `aigp_judge` config loads                                             | **LIVE** — `GET /v1/rails/configs` → `[{"id":"aigp_judge"}]`.                                                 |
| Server routes (only `/v1/chat/completions`, no legacy endpoint)       | **LIVE** — `/openapi.json` paths.                                                                             |
| Request envelope (`model` required; `guardrails.{config_id,options}`) | **LIVE** — bare `{config_id,messages,options}` → 422 `model Field required`; correct envelope → 200.          |
| Response envelope (`{id,choices[],created,model,object,guardrails}`)  | **LIVE** — captured 200 body (see below).                                                                     |
| Assistant text at `choices[0].message.content`                        | **LIVE** — captured.                                                                                          |
| Rail log location `guardrails.log.activated_rails[]`                  | **schema** (`GuardrailsDataOutput.log` + `GenerationLogOptions.activated_rails`) — see "not fully live" note. |
| Inner rail shape `{name, stop, ...}`                                  | **source** — `ActivatedRail.model_fields` = `type,name,decisions,executed_actions,stop,...`.                  |

**Not fully verified live:** a _populated_ `guardrails.log.activated_rails[]`
with the rail actually firing. The `aigp_judge` config's `self check output`
rail calls an OpenAI model (`gpt-4o-mini`); **no `OPENAI_API_KEY` was available
in this environment**, so the LLM call failed internally. The server still
returned a valid 200 envelope (with the assistant content set to "Internal
server error"), which is exactly what confirmed the request/response _shape_. The
_location_ of the rail log (`guardrails.log.activated_rails`) and the _inner_
rail fields (`name`, `stop`) are taken from the installed package's pydantic
models (`nemoguardrails.rails.llm.options.{GenerationLogOptions, ActivatedRail}`)
and `GuardrailsDataOutput`. To verify the populated log end-to-end, re-run with a
valid `OPENAI_API_KEY` in the `nemo` container env.

---

## Request — `POST /v1/chat/completions`

Schema `GuardrailsChatCompletionRequest` (OpenAI-compatible + NeMo extension).
`model` is **required**. Config selection and log options live under `guardrails`:

```json
{
  "model": "aigp_judge",
  "messages": [
    { "role": "user", "content": "<the red-team prompt>" },
    { "role": "assistant", "content": "<the model response being judged>" }
  ],
  "guardrails": {
    "config_id": "aigp_judge",
    "options": { "log": { "activated_rails": true } }
  }
}
```

- `model` is required by the schema but the effective model is fixed by the
  guardrails config; the adapter passes `cfg.configId` for it.
- `guardrails.config_id` selects the loaded config (`aigp_judge`).
- `guardrails.options.log.activated_rails: true` requests the rail log
  (`GenerationLogOptions`; default is `false`/nothing).

## Response — `200`, schema `GuardrailsChatCompletion`

OpenAI-style envelope with a NeMo `guardrails` extension:

```json
{
  "id": "chatcmpl-...",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "<judged/guarded assistant text>",
        "role": "assistant"
      }
    }
  ],
  "created": 1781876220,
  "model": "gpt-4o-mini",
  "object": "chat.completion",
  "guardrails": {
    "config_id": "aigp_judge",
    "log": {
      "activated_rails": [{ "name": "self check output", "stop": true }]
    }
  }
}
```

- Generated/guarded text: `choices[0].message.content`.
- Rail activation log: `guardrails.log.activated_rails[]` (only present when
  `guardrails.options.log.activated_rails: true` was requested **and** the rail
  ran). Each entry's relevant fields: `name` (string), `stop` (bool — true when
  the rail blocked). Full `ActivatedRail` fields:
  `type, name, decisions, executed_actions, stop, additional_info, started_at,
finished_at, duration`.

**Captured live body** (no OpenAI key, so the rail's LLM call errored — envelope
shape is what this confirms):

```json
{
  "id": "chatcmpl-4a5dc283-...",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": { "content": "Internal server error", "role": "assistant" }
    }
  ],
  "created": 1781876220,
  "model": "gpt-4o-mini",
  "object": "chat.completion",
  "guardrails": { "config_id": "aigp_judge" }
}
```

---

## Change vs. the original adapter assumption

`client.ts` was originally written against a **legacy / pre-0.22** envelope:
top-level `body.messages` + `body.log.activated_rails[]`, with request
`{config_id, messages, options.log}`. That envelope **does not exist** in the
bundled 0.22.0 server (only OpenAI-style `/v1/chat/completions`). The adapter and
its test were updated to the verified 0.22.0 contract:

- Request now sends `model` + `guardrails.{config_id, options.log.activated_rails}`.
- Response is read at `guardrails.log.activated_rails` (legacy `log.activated_rails`
  is still read as a defensive fallback).
- The inner pass/fail logic is unchanged: a rail with `stop === true` or a name
  matching `BLOCKING_RAIL_HINTS` ⇒ `fail`; otherwise `pass`. The `ActivatedRail`
  `{name, stop}` fields that logic depends on are unchanged in 0.22.0.

## Other endpoints (live)

- `GET /v1/rails/configs` → `[{"id":"aigp_judge"}]` (loaded configs).
- `GET /v1/models`, `GET /v1/challenges`, `GET /` also exist.
