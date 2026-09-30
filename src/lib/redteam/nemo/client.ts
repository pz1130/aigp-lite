import type { NemoConfig } from "./config";
import type { CheckerResult } from "../types";

export interface NemoJudgeRequest {
  prompt: string;
  response: string;
}

export interface NemoJudgeDeps {
  cfg: NemoConfig;
  fetchImpl?: typeof fetch;
}

interface ActivatedRail {
  name?: string;
  stop?: boolean;
}
// NeMo Guardrails 0.22.0 serves an OpenAI-compatible `/v1/chat/completions`
// (verified live against the sidecar, 2026-06-19; see
// docs/nemo-real-api-contract.md). The generated message is at
// `choices[0].message.content`, and the rail-activation log — when requested via
// `guardrails.options.log.activated_rails` — is returned under
// `guardrails.log.activated_rails[]`. The inner `ActivatedRail` shape
// (`{name, stop, ...}`) is unchanged from NeMo's GenerationLog model.
//
// The legacy top-level `{messages, log.activated_rails}` envelope this client
// originally targeted no longer exists in the bundled server. Both legacy and
// new field locations are read defensively so the parser tolerates either a
// future revert or an older server build.
interface NemoChatResponse {
  // legacy (pre-0.22) envelope — kept for forward/backward tolerance
  messages?: { role: string; content: string }[];
  log?: { activated_rails?: ActivatedRail[] };
  // 0.22.0 OpenAI-compatible envelope
  choices?: { message?: { role?: string; content?: string } }[];
  guardrails?: {
    config_id?: string;
    log?: { activated_rails?: ActivatedRail[] };
  };
}

// Rails whose activation means the judged response was blocked/flagged.
// Matched case-insensitively as a substring (a fallback for when NeMo does not
// populate `stop`) so minor naming drift in the config doesn't silently pass.
// Deliberately biased to over-flag (fail) rather than silently pass an
// unrecognized blocking rail — a missed flag misrepresents judgment quality.
const BLOCKING_RAIL_HINTS = [
  "output",
  "content safety",
  "jailbreak",
  "self check",
];

function authHeaders(cfg: NemoConfig): Record<string, string> {
  return cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
}

export async function judgeWithNemo(
  req: NemoJudgeRequest,
  deps: NemoJudgeDeps,
): Promise<CheckerResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { cfg } = deps;
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(cfg) },
      body: JSON.stringify({
        // 0.22.0 OpenAI-compatible request: `model` is required by the schema
        // (the actual model used is fixed by the guardrails config); config
        // selection and log options live under `guardrails`.
        model: cfg.configId,
        messages: [
          { role: "user", content: req.prompt },
          { role: "assistant", content: req.response },
        ],
        guardrails: {
          config_id: cfg.configId,
          options: { log: { activated_rails: true } },
        },
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!res.ok) {
      return {
        judgment: "error",
        reason: `NeMo ${res.status}: ${(await res.text()).slice(0, 180)}`,
      };
    }
    const body = (await res.json()) as NemoChatResponse;
    const rails =
      body.guardrails?.log?.activated_rails ?? body.log?.activated_rails ?? [];
    const blocking = rails.find(
      (r) =>
        r.stop === true ||
        BLOCKING_RAIL_HINTS.some((h) =>
          (r.name ?? "").toLowerCase().includes(h),
        ),
    );
    if (blocking) {
      return {
        judgment: "fail",
        reason: `NeMo rail flagged response: ${blocking.name ?? "blocking rail"}`,
      };
    }
    return { judgment: "pass", reason: "No NeMo rail flagged the response" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { judgment: "error", reason: msg.slice(0, 200) };
  }
}
