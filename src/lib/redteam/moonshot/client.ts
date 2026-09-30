import type { MoonshotConfig } from "./config";
import type { MoonshotRawResult } from "./mapper";
import {
  buildConnectorPayload,
  registerConnector,
  deleteConnector,
  type AigpConnectionLike,
} from "./connector";
import { toMoonshotRecipes } from "./recipe-map";
import { toRawResult, type MoonshotRunArtifact } from "./result-flatten";

// Real lifecycle: docs/moonshot-real-api-contract.md.
//   register  POST /api/v1/llm-endpoints           (connector.ts)
//   start     POST /api/v1/benchmarks?type=recipe  (BenchmarkRunnerDTO; runner_id = slug(run_name))
//   status    GET  /api/v1/benchmarks/status        (dict keyed by runner_id)
//   results   GET  /api/v1/benchmarks/results/{runner_id}  (web-format ResultArguments: results.recipes[].details[].data[])
//   cleanup   DELETE /api/v1/llm-endpoints/{endpoint_id}   (connector.ts, finally)

export interface MoonshotRunRequest {
  connectionId: string;
  model: string;
  recipes: string[];
  resolveTarget?: (
    connectionId: string,
  ) => Promise<{ conn: AigpConnectionLike; creds: { apiKey?: string } }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TERMINAL_OK = new Set(["completed", "completed_with_errors"]);
const TERMINAL_FAIL = new Set(["cancelled"]);

function authHeaders(cfg: MoonshotConfig): Record<string, string> {
  return cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
}

async function jget(
  fetchImpl: typeof fetch,
  url: string,
  cfg: MoonshotConfig,
): Promise<unknown> {
  const res = await fetchImpl(url, { headers: authHeaders(cfg) });
  if (!res.ok)
    throw new Error(
      `Moonshot GET ${url} failed: ${res.status} ${await res.text()}`,
    );
  return res.json();
}

function slugSafe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Status dict value carries the run state under `current_status` (pinned by a live
// run, Task 10: finished runners DO persist in the dict with current_status
// "completed"). The `status` fallback + results-name fallback below keep the poll
// correct even if a future build drops finished runners from the dict.
function statusOf(entry: unknown): string | undefined {
  if (entry && typeof entry === "object") {
    const s =
      (entry as Record<string, unknown>).current_status ??
      (entry as Record<string, unknown>).status;
    if (typeof s === "string") return s.toLowerCase();
  }
  return undefined;
}

export async function runMoonshotBenchmark(
  cfg: MoonshotConfig,
  req: MoonshotRunRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<MoonshotRawResult> {
  let endpointId = "default";
  let registered = false;
  if (req.resolveTarget) {
    const { conn, creds } = await req.resolveTarget(req.connectionId);
    endpointId = await registerConnector(
      cfg,
      buildConnectorPayload(conn, creds, req.model),
      fetchImpl,
    );
    registered = true;
  }

  // runner_id is the slug of run_name; keep run_name slug-safe so we own the id.
  const runName = slugSafe(
    `aigp-run-${req.connectionId}-${Date.now().toString(36)}`,
  );

  try {
    const startRes = await fetchImpl(
      `${cfg.baseUrl}/api/v1/benchmarks?type=recipe`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(cfg) },
        body: JSON.stringify({
          run_name: runName,
          description: `AIGP red-team run for connection ${req.connectionId}`,
          endpoints: [endpointId],
          inputs: toMoonshotRecipes(req.recipes),
          prompt_selection_percentage: 100,
          random_seed: 0,
          system_prompt: "",
          runner_processing_module: "benchmarking",
        }),
      },
    );
    if (!startRes.ok)
      throw new Error(
        `Moonshot run start failed: ${startRes.status} ${await startRes.text()}`,
      );
    const runnerId = runName;

    const deadline = Date.now() + cfg.pollTimeoutMs;
    for (;;) {
      const all = (await jget(
        fetchImpl,
        `${cfg.baseUrl}/api/v1/benchmarks/status`,
        cfg,
      )) as Record<string, unknown>;
      const state = statusOf(all?.[runnerId]);
      if (state && TERMINAL_OK.has(state)) break;
      if (state && TERMINAL_FAIL.has(state))
        throw new Error(`Moonshot run ${runnerId} ${state}`);
      if (!state) {
        // Absent from the status dict: not-yet-started OR already-finished.
        // The result file exists only once the run completes → authoritative.
        const names = (await jget(
          fetchImpl,
          `${cfg.baseUrl}/api/v1/benchmarks/results/name`,
          cfg,
        )) as string[];
        if (Array.isArray(names) && names.includes(runnerId)) break;
      }
      if (Date.now() > deadline)
        throw new Error(
          `Moonshot run ${runnerId} timed out after ${cfg.pollTimeoutMs}ms`,
        );
      await sleep(cfg.pollIntervalMs);
    }

    const artifact = (await jget(
      fetchImpl,
      `${cfg.baseUrl}/api/v1/benchmarks/results/${runnerId}`,
      cfg,
    )) as MoonshotRunArtifact;
    return toRawResult(artifact);
  } finally {
    if (registered) await deleteConnector(cfg, endpointId, fetchImpl);
  }
}
