import { createHash } from "node:crypto";
import { withRetry, type RetryOpts } from "../retry";
import { safeFetch } from "@/lib/egress/guard";

const DEFAULT_RETRY: RetryOpts = {
  maxAttempts: 3,
  backoffMs: [1000, 4000, 16000],
};

export function payloadHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function deliverWebhook(
  url: string,
  body: unknown,
  retryOpts: RetryOpts = DEFAULT_RETRY,
): Promise<{ externalRef?: string; payloadHash: string }> {
  const hash = payloadHash(body);
  await withRetry(async () => {
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`webhook ${res.status}: ${text.slice(0, 200)}`);
    }
  }, retryOpts);
  return { payloadHash: hash };
}
