import type { MoonshotConfig } from "./config";

// Real contract: docs/moonshot-real-api-contract.md (Op 1 / Op delete).
// Register = POST /api/v1/llm-endpoints with a full EndpointCreateDTO; the
// response is a message dict (NOT the id), so we pass a slug-safe `id` we own and
// reuse it verbatim for the run and the delete.

export interface AigpConnectionLike {
  id: string;
  providerType: string;
  baseUrl: string | null;
  model: string;
}

// EndpointCreateDTO — every field below is required by Moonshot except the
// connector defaults we supply. `id` is accepted and becomes the endpoint id.
export interface MoonshotConnectorPayload {
  id: string;
  name: string;
  connector_type: string;
  uri: string;
  token: string;
  max_calls_per_second: number;
  max_concurrency: number;
  model: string;
  params: Record<string, unknown>;
}

// AIGP providerType → Moonshot connector_type (note the `-connector` suffix;
// `GET /api/v1/connectors` lists the valid ids). Unknown providers fall through
// to `<providerType>-connector`; already-suffixed values pass through unchanged.
const CONNECTOR_TYPE_ALIASES: Record<string, string> = {
  openai: "openai-connector",
  anthropic: "anthropic-connector",
  google: "google-gemini-connector",
  "google-gemini": "google-gemini-connector",
  gemini: "google-gemini-connector",
  azure: "azure-openai-connector",
  "azure-openai": "azure-openai-connector",
  bedrock: "amazon-bedrock-connector",
  "amazon-bedrock": "amazon-bedrock-connector",
  together: "together-connector",
  huggingface: "huggingface-connector",
};

export function toConnectorType(providerType: string): string {
  const key = providerType.toLowerCase();
  if (CONNECTOR_TYPE_ALIASES[key]) return CONNECTOR_TYPE_ALIASES[key];
  return key.endsWith("-connector") ? key : `${key}-connector`;
}

// Keep ids slug-safe (lowercase, hyphen-only) so Moonshot stores them verbatim —
// no slug-guessing round-trip.
function slugSafe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildConnectorPayload(
  conn: AigpConnectionLike,
  creds: { apiKey?: string },
  model: string,
): MoonshotConnectorPayload {
  const id = slugSafe(`aigp-ep-${conn.id}-${Date.now().toString(36)}`);
  return {
    id,
    name: id,
    connector_type: toConnectorType(conn.providerType),
    uri: conn.baseUrl ?? "",
    token: creds.apiKey ?? "",
    max_calls_per_second: 10,
    max_concurrency: 5,
    model,
    params: {},
  };
}

export async function registerConnector(
  cfg: MoonshotConfig,
  payload: MoonshotConnectorPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(`${cfg.baseUrl}/api/v1/llm-endpoints`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(
      `Moonshot endpoint register failed: ${res.status} ${await res.text()}`,
    );
  // Response is a message dict, not the id — we own the id we sent.
  return payload.id;
}

export async function deleteConnector(
  cfg: MoonshotConfig,
  endpointId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl(`${cfg.baseUrl}/api/v1/llm-endpoints/${endpointId}`, {
      method: "DELETE",
      headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
    });
  } catch {
    // best-effort cleanup — never throws
  }
}
