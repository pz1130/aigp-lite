import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";
import { policyEvents } from "@/lib/events/policy-bus";
import { getIntegrationAdapter } from "./registry";
import type { OutboundEvent } from "./types";

export async function dispatchOutbound(ev: OutboundEvent): Promise<void> {
  const integrations = await prisma.enterpriseIntegration.findMany({
    where: {
      orgId: ev.orgId,
      isActive: true,
      subscribedEvents: { has: ev.type },
    },
  });

  for (const integ of integrations) {
    try {
      const adapter = getIntegrationAdapter(integ.integrationType);
      const creds = decryptJson<Record<string, string>>(
        integ.credentialsEncrypted,
      );
      const result = await adapter.send(integ, ev, creds);
      await prisma.integrationSyncLog.create({
        data: {
          integrationId: integ.id,
          direction: "outbound",
          eventType: ev.type,
          resourceType: ev.resourceType,
          resourceId: ev.resourceId,
          externalRef: result.externalRef,
          payloadHash: result.payloadHash,
          status: "ok",
        },
      });
      await prisma.enterpriseIntegration.update({
        where: { id: integ.id },
        data: { lastDeliveryAt: new Date(), healthStatus: "ok" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      console.warn("[integrations-ext] delivery failed", {
        id: integ.id,
        err: msg,
      });
      await prisma.integrationSyncLog.create({
        data: {
          integrationId: integ.id,
          direction: "outbound",
          eventType: ev.type,
          resourceType: ev.resourceType,
          resourceId: ev.resourceId,
          status: "failed",
          attemptCount: 3,
          errorMessage: msg.slice(0, 500),
        },
      });
      await prisma.enterpriseIntegration.update({
        where: { id: integ.id },
        data: { healthStatus: `failed:${msg.slice(0, 100)}` },
      });
    }
  }
}

let wired = false;
export function wireSubscribers(): void {
  if (wired) return;
  wired = true;

  policyEvents.onBlocked((p) => {
    void dispatchOutbound({
      type: "policy.blocked",
      orgId: p.orgId,
      resourceType: "policy",
      resourceId: p.policyId,
      payload: { ...p },
      occurredAt: new Date(),
    });
  });
}

wireSubscribers();
