import crypto from "node:crypto";
import { safeFetch } from "@/lib/egress/guard";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  orgId: string;
  data: Record<string, unknown>;
}

/**
 * HMAC-SHA256 sign an object payload. Returns hex signature.
 */
export function signPayload(payload: WebhookPayload, secret: string): string {
  const body = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * POST a signed webhook payload to a URL. Throws on non-2xx.
 */
export async function deliverEvent(
  url: string,
  payload: WebhookPayload,
  secret: string,
): Promise<void> {
  const signature = signPayload(payload, secret);
  const body = JSON.stringify(payload);
  const res = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AIGP-Signature": signature,
      "X-AIGP-Event": payload.event,
      "X-AIGP-Timestamp": payload.timestamp,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  }
}

interface RegisteredEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
}

/**
 * Deliver to all enabled endpoints matching the event type.
 */
export async function deliverToOrg(
  endpoints: RegisteredEndpoint[],
  event: string,
  orgId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const matching = endpoints.filter(
    (e) => e.enabled && e.events.includes(event),
  );
  await Promise.all(
    matching.map((ep) =>
      deliverEvent(
        ep.url,
        { event, timestamp: new Date().toISOString(), orgId, data },
        ep.secret,
      ).catch((err) => {
        console.error(`Webhook delivery error for endpoint ${ep.id}:`, err);
      }),
    ),
  );
}
