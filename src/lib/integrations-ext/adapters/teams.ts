import type { EnterpriseIntegration } from "@/lib/prisma";
import type { IntegrationAdapter, OutboundEvent, SendResult } from "../types";
import { deliverWebhook } from "./shared-webhook";

function severityColor(severity: unknown): string {
  switch (severity) {
    case "critical":
      return "FF0000";
    case "high":
      return "F08080";
    case "medium":
      return "FFA500";
    default:
      return "808080";
  }
}

function formatMessageCard(ev: OutboundEvent): unknown {
  const p = ev.payload as Record<string, unknown>;
  const sections: unknown[] = [];

  if (ev.type === "incident.created" || ev.type === "incident.statusChanged") {
    const sev = String(p.severity ?? "n/a").toUpperCase();
    sections.push({
      activityTitle: `**[${sev}] Incident**`,
      activitySubtitle: p.title,
      facts: [
        { name: "Status", value: p.status ?? "open" },
        { name: "Incident ID", value: p.id },
      ],
    });
  } else if (ev.type === "budget.threshold.exceeded") {
    sections.push({
      activityTitle: `**Budget threshold ${p.threshold}% reached**`,
      facts: [
        { name: "Scope", value: p.scope },
        { name: "Period", value: p.period },
        { name: "Amount", value: `$${p.amountUsd}` },
      ],
    });
  } else if (ev.type === "policy.blocked") {
    sections.push({
      activityTitle: "**Policy blocked**",
      facts: [{ name: "Policy", value: p.policyName ?? "" }],
      text: String(p.snippet ?? "").slice(0, 200),
    });
  } else if (ev.type === "runtime.llm.blocked") {
    sections.push({
      activityTitle: "**LLM call blocked**",
      facts: [
        { name: "Provider", value: p.provider ?? "" },
        { name: "Model", value: p.model ?? "" },
      ],
    });
  } else if (ev.type === "integration.test") {
    sections.push({
      activityTitle: "AIGP integration test",
      text: "Your connector is reachable.",
    });
  } else {
    sections.push({
      activityTitle: ev.type,
      text: JSON.stringify(p).slice(0, 500),
    });
  }

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: severityColor(p.severity),
    summary: ev.type,
    sections,
  };
}

export const teamsAdapter: IntegrationAdapter = {
  async send(
    _integration: EnterpriseIntegration,
    ev: OutboundEvent,
    creds: Record<string, string>,
  ): Promise<SendResult> {
    const body = formatMessageCard(ev);
    const r = await deliverWebhook(creds.webhookUrl, body);
    return { payloadHash: r.payloadHash };
  },
};
