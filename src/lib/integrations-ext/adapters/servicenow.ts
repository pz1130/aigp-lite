import { createHash } from "node:crypto";
import type { EnterpriseIntegration } from "@/lib/prisma";
import type {
  IntegrationAdapter,
  InboundResult,
  OutboundEvent,
  SendResult,
} from "../types";
import { withRetry } from "../retry";
import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/egress/guard";

const SEV_TO_URGENCY: Record<string, string> = {
  critical: "1",
  high: "2",
  medium: "2",
  low: "3",
};

const STATUS_TO_STATE: Record<string, string> = {
  open: "1",
  investigating: "2",
  mitigating: "3",
  mitigated: "3",
  resolved: "6",
  closed: "7",
};

const STATE_TO_STATUS: Record<string, string> = {
  "1": "open",
  "2": "investigating",
  "3": "mitigated",
  "6": "closed",
  "7": "closed",
};

const TRACKED_FIELDS = [
  "short_description",
  "state",
  "u_aigp_incident_id",
] as const;

export function canonicalizeIncidentSync(
  payload: Record<string, unknown>,
): string {
  const subset: Record<string, string> = {};
  for (const k of TRACKED_FIELDS) {
    subset[k] = String(payload[k] ?? "");
  }
  const ordered = Object.keys(subset)
    .sort()
    .reduce<Record<string, string>>((a, k) => {
      a[k] = subset[k];
      return a;
    }, {});
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

function basicAuth(u: string, p: string): string {
  return `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
}

export const serviceNowAdapter: IntegrationAdapter = {
  async send(
    integration: EnterpriseIntegration,
    ev: OutboundEvent,
    creds: Record<string, string>,
  ): Promise<SendResult> {
    if (ev.resourceType !== "incident") {
      return { payloadHash: canonicalizeIncidentSync({}) };
    }

    const config = (integration.config ?? {}) as { instanceUrl?: string };
    if (!config.instanceUrl) {
      throw new Error("servicenow: instanceUrl missing in config");
    }

    const p = ev.payload as Record<string, unknown>;
    const body = {
      short_description: String(p.title ?? ""),
      description: String(p.summary ?? p.title ?? ""),
      urgency: SEV_TO_URGENCY[String(p.severity ?? "medium")] ?? "2",
      state: STATUS_TO_STATE[String(p.status ?? "open")] ?? "1",
      category: "AI / Policy violation",
      u_aigp_incident_id: String(p.id ?? ev.resourceId),
    };

    const existing = await prisma.incident.findUnique({
      where: { id: String(p.id ?? ev.resourceId) },
    });
    const refs =
      (existing?.externalRefs as Record<string, { sysId?: string }> | null) ??
      {};
    const sysId = refs[integration.id]?.sysId;

    const base = config.instanceUrl.replace(/\/$/, "");
    const url = sysId
      ? `${base}/api/now/table/incident/${sysId}`
      : `${base}/api/now/table/incident`;
    const method = sysId ? "PATCH" : "POST";

    const result = await withRetry(
      async () => {
        const res = await safeFetch(url, {
          method,
          headers: {
            "content-type": "application/json",
            authorization: basicAuth(creds.username, creds.password),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`servicenow ${res.status}: ${t.slice(0, 200)}`);
        }
        return (await res.json()).result as { number: string; sys_id: string };
      },
      { maxAttempts: 3, backoffMs: [1000, 4000, 16000] },
    );

    const hash = canonicalizeIncidentSync(body);

    if (existing) {
      const nextRefs: Record<
        string,
        { ticketNumber: string; sysId: string; lastSyncHash: string }
      > = {
        ...(refs as Record<
          string,
          { ticketNumber: string; sysId: string; lastSyncHash: string }
        >),
      };
      nextRefs[integration.id] = {
        ticketNumber: result.number,
        sysId: result.sys_id,
        lastSyncHash: hash,
      };
      await prisma.incident.update({
        where: { id: existing.id },
        data: { externalRefs: nextRefs },
      });
    }

    return { externalRef: result.number, payloadHash: hash };
  },

  async applyInbound(
    integration: EnterpriseIntegration,
    payload: unknown,
    _creds: Record<string, string>,
  ): Promise<InboundResult> {
    const p = (payload ?? {}) as Record<string, unknown>;
    const localId = String(p.u_aigp_incident_id ?? "");
    const hash = canonicalizeIncidentSync(p);

    const incident = localId
      ? await prisma.incident.findFirst({
          where: { id: localId, orgId: integration.orgId },
        })
      : null;
    if (!incident) {
      return {
        resourceType: "incident",
        resourceId: localId,
        action: "not_found",
        payloadHash: hash,
      };
    }

    const refs = (incident.externalRefs ?? {}) as Record<
      string,
      {
        sysId?: string;
        ticketNumber?: string;
        lastSyncHash?: string;
      }
    >;
    if (refs[integration.id]?.lastSyncHash === hash) {
      return {
        resourceType: "incident",
        resourceId: incident.id,
        action: "skipped_echo",
        payloadHash: hash,
      };
    }

    const newStatus = STATE_TO_STATUS[String(p.state ?? "")] ?? incident.status;
    refs[integration.id] = {
      ...refs[integration.id],
      sysId: String(p.sys_id ?? refs[integration.id]?.sysId ?? ""),
      ticketNumber: String(
        p.number ?? refs[integration.id]?.ticketNumber ?? "",
      ),
      lastSyncHash: hash,
    };

    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: newStatus as typeof incident.status, externalRefs: refs },
    });

    return {
      resourceType: "incident",
      resourceId: incident.id,
      action: "updated",
      payloadHash: hash,
    };
  },
};
