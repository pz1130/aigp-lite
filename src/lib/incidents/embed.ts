import type { ProviderConnection } from "@/lib/prisma";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";
import { safeFetch } from "@/lib/egress/guard";
import { metric } from "./metrics";

const EMBED_MODEL = "text-embedding-3-small";

export async function getEmbeddingConnection(
  orgId: string,
): Promise<ProviderConnection | null> {
  const rows = await prisma.providerConnection.findMany({
    where: { orgId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    rows.find((r) => {
      const cfg = r.config as Record<string, unknown> | null;
      return cfg?.supportsEmbeddings === true;
    }) ?? null
  );
}

export async function embedText(
  orgId: string,
  text: string,
): Promise<number[] | null> {
  const conn = await getEmbeddingConnection(orgId);
  if (!conn) return null;

  let apiKey: string | undefined;
  try {
    const creds = decryptJson<Record<string, string>>(
      conn.credentialsEncrypted,
    );
    apiKey = creds.apiKey;
  } catch {
    return null;
  }
  if (!apiKey) return null;

  const baseUrl = conn.baseUrl ?? "https://api.openai.com";
  const url = `${baseUrl.replace(/\/$/, "")}/v1/embeddings`;

  let res: Response;
  try {
    res = await safeFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
  } catch {
    metric("incident.embedding.failed", { reason: "network" });
    return null;
  }

  if (!res.ok) {
    metric("incident.embedding.failed", { reason: `http_${res.status}` });
    return null;
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
    usage?: { prompt_tokens?: number };
  };
  const vec = json.data?.[0]?.embedding;
  if (!vec || vec.length === 0) return null;

  await prisma.llmInvocation.create({
    data: {
      orgId,
      provider: conn.providerType,
      model: EMBED_MODEL,
      promptHash: "",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: 0,
      policyHits: [],
      blocked: false,
      connectionId: conn.id,
    },
  });

  return vec;
}
