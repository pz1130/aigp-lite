# Moonshot Web API — Real Contract (Task 1 hard-gate deliverable)

**Date:** 2026-06-13
**Source:** live sidecar `/openapi.json` (97 KB) + Moonshot package source, both from
`docker/moonshot/Dockerfile` (`aiverify-moonshot[all]`), inspected via
`docker compose exec moonshot ...`. This file is the single source of truth for
the adapter (Tasks 3–6); every `VERIFY(task1)` marker in code reconciles against it.

**Task 10 status (2026-06-13):** the full lifecycle (register → start → poll →
fetch → flatten) was driven end-to-end against the live sidecar with a mock OpenAI
target — 22 `jailbreak-dan` rows flowed through the real `runMoonshotBenchmark` TS
path. The two residual `VERIFY(live, Task 10)` zones (status field name; result
grouping shape) are now **pinned** — see Op 3 and Op 4. No markers remain.

The real API is **async / session-based** and differs materially from AIGP's
assumed synchronous `POST /api/v1/benchmarks/run` placeholder across **all four**
lifecycle operations. The notes below are what the code was reconciled to.

---

## Connector types

`GET /api/v1/connectors` returns ids that **carry a `-connector` suffix**, not bare
provider names:

```
openai-connector  anthropic-connector  google-gemini-connector
azure-openai-connector  amazon-bedrock-connector  together-connector
huggingface-connector  h2ogpte-connector  flageval-connector
azure-openai-t2i-connector  openai-t2i-connector
azure-langchain-openai-chatopenai-connector
azure-langchain-openai-embedding-connector
```

AIGP `providerType → connector_type` map (see `connector.ts`):
`openai → openai-connector`, `anthropic → anthropic-connector`,
`google`/`google-gemini`/`gemini → google-gemini-connector`,
`azure`/`azure-openai → azure-openai-connector`,
`bedrock`/`amazon-bedrock → amazon-bedrock-connector`; otherwise
`<providerType>-connector` (already-suffixed values pass through unchanged).

## Op 1 — Register endpoint

- `POST /api/v1/llm-endpoints`
- Body `EndpointCreateDTO` — **all required** except `id`/`created_date`:
  `{ id?, name*, connector_type*, uri*, token*, max_calls_per_second* (int),
max_concurrency* (int), model*, params* (object) }`
- **Response is a message dict** (`{string: string}`) or `[dict, int]` — it does
  **NOT** return the endpoint id. Moonshot derives the endpoint id by slugifying
  `name` (or uses `id` if supplied).
- **Adapter rule:** we **pass `id` explicitly** and keep `name`/`id` slug-safe
  (lowercase, hyphen-only: `aigp-ep-<connId>-<ts36>`), so we own the id verbatim
  for the run and the delete — no slug-guessing, no reading the response.

## Op 2 — Start run

- `POST /api/v1/benchmarks?type=recipe` (`type` query param required;
  `BenchmarkCollectionType` enum = `cookbook | recipe` — we use `recipe`).
- Body `BenchmarkRunnerDTO` — **all required**:
  `{ run_name*, description*, endpoints* (endpoint-id[]), inputs* (recipe-id[]),
prompt_selection_percentage* (int), random_seed* (int), system_prompt*,
runner_processing_module* }`
  - `inputs` = the recipe ids (NOT `recipes`).
  - `runner_processing_module` = `"benchmarking"` (the recipe/benchmark processor).
  - `prompt_selection_percentage` 1–100; `system_prompt` may be `""`.
- **Response:** object; the runner id is the **slug of `run_name`**. We keep
  `run_name` slug-safe (`aigp-run-<connId>-<ts36>`) so `runner_id == run_name`
  verbatim — used for both status lookup and results fetch.

## Op 3 — Poll status

- `GET /api/v1/benchmarks/status`
- Response: a **dict keyed by runner_id** → progress object carrying
  `current_status` (`RunStatus`: `pending | running | running_with_errors |
completed | completed_with_errors | cancelled`) and a numeric progress. Returns
  `{}` when no runner is being tracked. A finished runner may **drop out** of the
  dict.
- **Adapter rule (robust completion signal):** look up `status[runner_id]`.
  - `completed` / `completed_with_errors` → done, fetch results.
  - `cancelled` → throw.
  - absent → ambiguous (not-yet-started **or** already-finished); fall back to
    `GET /api/v1/benchmarks/results/name` — if it lists `runner_id`, the result
    file exists ⇒ done; else keep polling until `pollTimeoutMs`.
- **Pinned (Task 10, live):** the progress field is **`current_status`**, and a
  finished runner **does persist** in the status dict with `current_status:
"completed"` — the poll breaks on that directly. `statusOf` reads
  `current_status ?? status`; the results-name fallback is retained as a belt-and-
  braces guard in case a future build drops finished runners from the dict.

## Op 4 — Fetch results

- `GET /api/v1/benchmarks/results/{result_id}` where `result_id = runner_id`.
- **Pinned (Task 10, live):** the single-result route returns the **web-format
  `ResultArguments`** — there is **no top-level `raw_results`**. Per-prompt
  predictions are nested:
  ```
  { metadata: { id, status, recipes: [recipe_id, ...] },
    results: {
      recipes: [
        { id: <recipe_id>,
          details: [
            { model_id, dataset_id, prompt_template_id,
              data: [
                { prompt,
                  predicted_result: { response, context },  // SINGULAR; text at .response
                  target,
                  duration }   // seconds (float)
              ] } ] } ] } }
  ```
  - The per-prompt key is **`predicted_result`** (singular), a `{response, context}`
    object — not `predicted_results`. `duration` is **seconds** (float); the adapter
    converts to ms (`Math.round(duration * 1000)`).
  - No per-prompt `passed`/`score` in the observed data points ⇒ `flattenArtifact`
    defaults `passed: true` and derives severity from the recipe baseline.
- `result-flatten.ts` walks `results.recipes[].details[].data[]` and stays tolerant
  of a plain-string `predicted_result` and of optional `predicted_results`/`tokens`
  (none seen live, kept for forward-compat). This is the one module Task 10 confirmed
  against the real shape — `result-flatten.test.ts` uses the captured `jailbreak-dan`
  payload.

## Op delete (cleanup)

- `DELETE /api/v1/llm-endpoints/{endpoint_id}` where `endpoint_id` = the `id` we
  registered. Best-effort in a `finally`; never throws.

---

## Recipe ids — verified against the live 119-recipe list

Every AIGP category maps to a **real** recipe (the earlier worry that
`prompt-injection` / `challenging-harmful-prompts` / `pii-leak` exist was wrong —
those three ids do **not** exist; corrected below):

| Category           | Recipe id (real)                          | Baseline severity | Note                                                                                                                                                                                 |
| ------------------ | ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toxicity`         | `challenging-toxicity-prompts-completion` | medium            | ✓ verified                                                                                                                                                                           |
| `jailbreak`        | `jailbreak-dan`                           | high              | ✓ verified                                                                                                                                                                           |
| `bias`             | `bbq`                                     | medium            | ✓ verified                                                                                                                                                                           |
| `harmful`          | `answercarefully-en`                      | critical          | AnswerCarefully harmful-refusal set (was nonexistent `challenging-harmful-prompts`)                                                                                                  |
| `pii_leak`         | `enron-email`                             | high              | only PII-extraction recipe in the catalog (was nonexistent `pii-leak`)                                                                                                               |
| `prompt_injection` | `cyberseceval-en`                         | high              | CyberSecEval covers prompt-injection scenarios; Moonshot has no standalone injection _recipe_ (it's otherwise an attack-module/session concept) (was nonexistent `prompt-injection`) |
