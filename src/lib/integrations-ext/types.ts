import type { EnterpriseIntegration } from "@/lib/prisma";

export interface OutboundEvent {
  type: string;
  orgId: string;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface SendResult {
  externalRef?: string;
  payloadHash: string;
}

export interface InboundResult {
  resourceType: string;
  resourceId: string;
  action: "updated" | "skipped_echo" | "not_found";
  payloadHash: string;
}

export interface IntegrationAdapter {
  send(
    integration: EnterpriseIntegration,
    ev: OutboundEvent,
    creds: Record<string, string>,
  ): Promise<SendResult>;
  applyInbound?(
    integration: EnterpriseIntegration,
    payload: unknown,
    creds: Record<string, string>,
  ): Promise<InboundResult>;
}

export const SUBSCRIBABLE_EVENTS = [
  "incident.created",
  "incident.statusChanged",
  "policy.blocked",
  "budget.threshold.exceeded",
  "runtime.llm.blocked",
  "integration.test",
] as const;
export type SubscribableEvent = (typeof SUBSCRIBABLE_EVENTS)[number];
